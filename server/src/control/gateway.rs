//! 宝马ai 的固定网关接入与账单查询。
use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::time::Duration;

use super::ControlService;
use crate::{
    model::{ModelConfig, ModelConfigInput},
    Error, Result,
};

const BASE_URL: &str = "http://154.201.79.53:8080";
const MODEL_ID: &str = "gpt-6-sol";
const GROUP_NAME: &str = "宝马ai";

#[derive(Deserialize)]
pub struct ConnectInput {
    api_key: String,
    #[serde(default)]
    reasoning_effort: Option<String>,
}

#[derive(Deserialize)]
pub struct RecordQuery {
    #[serde(default = "first_page")]
    page: u32,
    start_date: Option<String>,
    end_date: Option<String>,
    model: Option<String>,
}

fn first_page() -> u32 {
    1
}

fn managed(model: &ModelConfig) -> bool {
    model.base_url == BASE_URL && model.group_name.as_deref() == Some(GROUP_NAME)
}

// 启动时删除内置组的废弃配置，历史调用记录由现有删除逻辑保留。
pub(crate) async fn remove_obsolete_models(store: &crate::store::Store) -> Result<()> {
    for model in store.models().await? {
        if model.group_name.as_deref() == Some(GROUP_NAME) && model.base_url != BASE_URL {
            store.delete_model(&model.model_hash).await?;
        }
    }
    Ok(())
}

async fn current(service: &ControlService) -> Result<Option<ModelConfig>> {
    Ok(service.store.models().await?.into_iter().find(managed))
}

fn view(model: Option<&ModelConfig>) -> Value {
    json!({
        "connected": model.is_some(), "base_url": BASE_URL, "model": MODEL_ID,
        "reasoning_effort": model.and_then(|m| m.reasoning_effort.as_deref()),
    })
}

pub async fn status(State(service): State<ControlService>) -> Result<Json<Value>> {
    Ok(Json(view(current(&service).await?.as_ref())))
}

// 禁止重定向，确保凭据只发往固定网关；不向界面或日志透传服务端原始错误。
async fn fetch(key: &str, path: &str, query: &[(String, String)]) -> Result<Value> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(20))
        .build()?;
    let response = client
        .get(format!("{BASE_URL}{path}"))
        .bearer_auth(key)
        .query(query)
        .send()
        .await
        .map_err(|_| Error::Provider("无法连接宝马ai，请检查网络后重试".into()))?;
    let status = response.status();
    if !status.is_success() {
        let message = match status.as_u16() {
            401 | 403 => "Key 无效、已停用或无访问权限",
            404 => "账单查询服务尚未接通，请联系管理员完成部署",
            429 => "查询过于频繁，请稍后重试",
            _ => "网关暂时无法提供数据，请稍后重试",
        };
        return Err(Error::Provider(message.into()));
    }
    response
        .json()
        .await
        .map_err(|_| Error::Provider("网关返回的数据格式不正确".into()))
}

// 使用明细接口由 Key 验证身份，服务端只返回该 Key 的数据。
async fn usage_data(key: &str, path: &str, query: &[(String, String)]) -> Result<Value> {
    let response = fetch(key, path, query).await?;
    if response.get("code").and_then(Value::as_i64) != Some(0) || !response["data"].is_object() {
        return Err(Error::Provider("使用明细数据格式不正确".into()));
    }
    Ok(response["data"].clone())
}

pub async fn connect(
    State(service): State<ControlService>,
    Json(input): Json<ConnectInput>,
) -> Result<Json<Value>> {
    let _guard = service.gateway_lock.lock().await;
    let key = input.api_key.trim();
    if key.is_empty() || key.len() > 4096 || key.chars().any(char::is_whitespace) || !key.is_ascii()
    {
        return Err(Error::Config("请输入有效的 API Key".into()));
    }
    let effort = input.reasoning_effort.as_deref().filter(|s| !s.is_empty());
    if effort.is_some_and(|s| !["low", "medium", "high", "xhigh"].contains(&s)) {
        return Err(Error::Config("不支持的推理等级".into()));
    }
    let usage = usage_data(key, "/bmapi/v1/summary", &[]).await?;
    if !usage["status"].is_string() || !usage["usage"]["total"].is_object() {
        return Err(Error::Provider("Key 验证未通过".into()));
    }
    let existing = current(&service).await?;
    let ids: Vec<String> = if existing.as_ref().is_some_and(|m| m.api_key == key) {
        service
            .store
            .models()
            .await?
            .into_iter()
            .filter(managed)
            .map(|m| m.model_id)
            .collect()
    } else {
        vec![MODEL_ID.into()]
    };
    save_models(&service, key, effort, &ids).await?;
    Ok(Json(view(current(&service).await?.as_ref())))
}

async fn save_models(
    service: &ControlService,
    key: &str,
    effort: Option<&str>,
    ids: &[String],
) -> Result<()> {
    let inputs = ids
        .iter()
        .enumerate()
        .map(|(index, id)| {
            let mut input = preset_model(key, effort, id)?;
            input.sort_order = (index + 1) as i64;
            Ok(input)
        })
        .collect::<Result<Vec<_>>>()?;
    service
        .store
        .replace_gateway_models(BASE_URL, GROUP_NAME, &inputs)
        .await
}

fn discovered_ids(data: &Value) -> Result<Vec<String>> {
    let rows = data["data"]
        .as_array()
        .ok_or_else(|| Error::Provider("模型列表格式不正确".into()))?;
    if rows.is_empty() || rows.len() > 500 {
        return Err(Error::Provider(
            "没有可用模型或模型数量异常，原配置已保留".into(),
        ));
    }
    let mut ids = std::collections::BTreeSet::new();
    for row in rows {
        let id = row["id"]
            .as_str()
            .filter(|id| !id.is_empty() && id.len() <= 200 && !id.chars().any(char::is_whitespace))
            .ok_or_else(|| Error::Provider("模型名称无效，原配置已保留".into()))?;
        ids.insert(id.to_string());
    }
    Ok(ids.into_iter().collect())
}

pub async fn sync_models(State(service): State<ControlService>) -> Result<Json<Value>> {
    let _guard = service.gateway_lock.lock().await;
    let model = current(&service)
        .await?
        .ok_or_else(|| Error::Config("请先连接 Key".into()))?;
    let ids = discovered_ids(&fetch(&model.api_key, "/v1/models", &[]).await?)?;
    save_models(
        &service,
        &model.api_key,
        model.reasoning_effort.as_deref(),
        &ids,
    )
    .await?;
    Ok(Json(json!({ "models": ids, "count": ids.len() })))
}

#[cfg(test)]
fn preset(key: &str, effort: Option<&str>) -> Result<ModelConfigInput> {
    preset_model(key, effort, MODEL_ID)
}

fn preset_model(key: &str, effort: Option<&str>, id: &str) -> Result<ModelConfigInput> {
    Ok(serde_json::from_value(json!({
        "display_name": format!("宝马ai · {id}"), "group_name": GROUP_NAME,
        "type": "openai", "base_url": BASE_URL, "api_key": key,
        "tooltip_data": "宝马ai", "model_id": id,
        "reasoning_effort": effort, "openai_endpoint": "/v1/responses"
    }))?)
}

pub async fn disconnect(State(service): State<ControlService>) -> Result<Json<Value>> {
    let _guard = service.gateway_lock.lock().await;
    service
        .store
        .replace_gateway_models(BASE_URL, GROUP_NAME, &[])
        .await?;
    Ok(Json(view(None)))
}

async fn key(service: &ControlService) -> Result<String> {
    current(service)
        .await?
        .map(|m| m.api_key)
        .ok_or_else(|| Error::Config("请先输入 Key 并连接".into()))
}

pub async fn usage(State(service): State<ControlService>) -> Result<Json<Value>> {
    Ok(Json(
        usage_data(&key(&service).await?, "/bmapi/v1/summary", &[]).await?,
    ))
}

pub async fn usage_models(State(service): State<ControlService>) -> Result<Json<Value>> {
    let data = usage_data(&key(&service).await?, "/bmapi/v1/models", &[]).await?;
    if !data["models"]
        .as_array()
        .is_some_and(|models| models.iter().all(Value::is_string))
    {
        return Err(Error::Provider("使用明细模型列表格式不正确".into()));
    }
    Ok(Json(data))
}

pub async fn records(
    State(service): State<ControlService>,
    Query(input): Query<RecordQuery>,
) -> Result<Json<Value>> {
    let mut query = vec![
        ("page".into(), input.page.max(1).to_string()),
        ("page_size".into(), "20".into()),
        ("timezone".into(), "Asia/Shanghai".into()),
    ];
    for (name, value) in [
        ("start_date", input.start_date),
        ("end_date", input.end_date),
    ] {
        if let Some(value) = value.filter(|s| !s.is_empty()) {
            if chrono::NaiveDate::parse_from_str(&value, "%Y-%m-%d").is_err() {
                return Err(Error::Config("日期格式不正确".into()));
            }
            query.push((name.into(), value));
        }
    }
    if let Some(model) = input.model.filter(|value| !value.is_empty()) {
        if model.len() > 200 || model.chars().any(char::is_control) {
            return Err(Error::Config("模型筛选条件不正确".into()));
        }
        query.push(("model".into(), model));
    }
    let data = usage_data(&key(&service).await?, "/bmapi/v1/records", &query).await?;
    if !data["items"].is_array() {
        return Err(Error::Provider("账单数据格式不正确".into()));
    }
    Ok(Json(data))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn obsolete_gateway_models_are_removed_without_touching_current_or_other_groups() {
        let folder = tempfile::tempdir().unwrap();
        let store = crate::store::Store::connect(&format!(
            "sqlite://{}",
            folder.path().join("obsolete.db").display()
        ))
        .await
        .unwrap();
        let current = store
            .create_model(&preset("current-test-key", None).unwrap())
            .await
            .unwrap();
        let mut obsolete = preset("obsolete-test-key", None).unwrap();
        obsolete.base_url = "https://obsolete.example".into();
        let removed = store.create_model(&obsolete).await.unwrap();
        let mut unrelated = obsolete.clone();
        unrelated.group_name = Some("其他服务".into());
        unrelated.api_key = "unrelated-test-key".into();
        let preserved = store.create_model(&unrelated).await.unwrap();

        remove_obsolete_models(&store).await.unwrap();
        assert!(store.model(&removed.model_hash).await.unwrap().is_none());
        assert!(store.model(&current.model_hash).await.unwrap().is_some());
        assert!(store.model(&preserved.model_hash).await.unwrap().is_some());

        store.create_model(&obsolete).await.unwrap();
        store
            .replace_gateway_models(
                BASE_URL,
                GROUP_NAME,
                &[preset("new-test-key", None).unwrap()],
            )
            .await
            .unwrap();
        let models = store.models().await.unwrap();
        assert_eq!(models.len(), 2);
        assert!(models
            .iter()
            .any(|model| model.model_hash == preserved.model_hash));
        assert!(models
            .iter()
            .filter(|model| model.group_name.as_deref() == Some(GROUP_NAME))
            .all(|model| model.base_url == BASE_URL && model.api_key == "new-test-key"));
    }

    #[test]
    fn model_discovery_rejects_bad_lists_and_deduplicates() {
        assert_eq!(
            discovered_ids(
                &json!({"data": [{"id":"gpt-6-sol"}, {"id":"gpt-6-sol"}, {"id":"gpt-6-astra"}]})
            )
            .unwrap(),
            vec!["gpt-6-astra", "gpt-6-sol"]
        );
        for data in [
            json!({}),
            json!({"data": []}),
            json!({"data": [{"id": ""}]}),
            json!({"data": [{"id": "bad\nmodel"}]}),
        ] {
            assert!(discovered_ids(&data).is_err());
        }
    }

    #[tokio::test]
    async fn model_sync_is_atomic_and_key_replacement_removes_old_credentials() {
        let folder = tempfile::tempdir().unwrap();
        let store = crate::store::Store::connect(&format!(
            "sqlite://{}",
            folder.path().join("sync.db").display()
        ))
        .await
        .unwrap();
        let inputs = vec![
            preset_model("old-test-key", Some("low"), "gpt-6-sol").unwrap(),
            preset_model("old-test-key", Some("low"), "gpt-6-astra").unwrap(),
        ];
        store
            .replace_gateway_models(BASE_URL, GROUP_NAME, &inputs)
            .await
            .unwrap();
        store
            .replace_gateway_models(BASE_URL, GROUP_NAME, &inputs)
            .await
            .unwrap();
        assert_eq!(store.models().await.unwrap().len(), 2);
        let invalid = vec![inputs[0].clone(), inputs[0].clone()];
        assert!(store
            .replace_gateway_models(BASE_URL, GROUP_NAME, &invalid)
            .await
            .is_err());
        assert_eq!(store.models().await.unwrap().len(), 2);
        let mut unrelated = preset_model("unrelated-test-key", None, "other-model").unwrap();
        unrelated.group_name = Some("其他服务".into());
        store.create_model(&unrelated).await.unwrap();
        store
            .replace_gateway_models(
                BASE_URL,
                GROUP_NAME,
                &[preset_model("new-test-key", Some("high"), "gpt-6-sol").unwrap()],
            )
            .await
            .unwrap();
        let models = store.models().await.unwrap();
        assert_eq!(models.len(), 2);
        assert!(models.iter().all(|m| m.api_key != "old-test-key"));
        assert_eq!(
            models
                .iter()
                .find(|m| managed(m))
                .unwrap()
                .reasoning_effort
                .as_deref(),
            Some("high")
        );
        store
            .replace_gateway_models(BASE_URL, GROUP_NAME, &[])
            .await
            .unwrap();
        assert_eq!(store.models().await.unwrap().len(), 1);
    }

    #[tokio::test]
    async fn replacing_key_preserves_a_single_managed_model() {
        let folder = tempfile::tempdir().unwrap();
        let store = crate::store::Store::connect(&format!(
            "sqlite://{}",
            folder.path().join("test.db").display()
        ))
        .await
        .unwrap();
        let first = store
            .create_model(&preset("first-test-key", Some("low")).unwrap())
            .await
            .unwrap();
        assert!(managed(&first));
        assert_eq!(
            first.provider_type(),
            crate::model::ProviderType::OpenAiResponses
        );
        let second = store
            .update_model(
                &first.model_hash,
                &preset("second-test-key", Some("high")).unwrap(),
            )
            .await
            .unwrap();
        let models = store.models().await.unwrap();
        assert_eq!(models.len(), 1);
        assert_eq!(models[0].api_key, "second-test-key");
        assert_eq!(models[0].reasoning_effort.as_deref(), Some("high"));
        assert!(managed(&models[0]));
        assert!(!view(Some(&models[0]))
            .to_string()
            .contains("second-test-key"));
        store.delete_model(&second.model_hash).await.unwrap();
        assert!(store.models().await.unwrap().is_empty());
    }
}
