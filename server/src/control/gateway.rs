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

const BASE_URL: &str = "https://ai.bmapi.me";
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
}

fn first_page() -> u32 {
    1
}

fn managed(model: &ModelConfig) -> bool {
    model.base_url == BASE_URL
        && model.model_id == MODEL_ID
        && model.group_name.as_deref() == Some(GROUP_NAME)
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
    let usage = fetch(key, "/v1/usage", &[]).await?;
    if usage.get("isValid").and_then(Value::as_bool) != Some(true) {
        return Err(Error::Provider("Key 验证未通过".into()));
    }
    let model = preset(key, effort)?;
    let saved = match current(&service).await? {
        Some(existing) => {
            service
                .store
                .update_model(&existing.model_hash, &model)
                .await?
        }
        None => service.store.create_model(&model).await?,
    };
    Ok(Json(view(Some(&saved))))
}

fn preset(key: &str, effort: Option<&str>) -> Result<ModelConfigInput> {
    Ok(serde_json::from_value(json!({
        "display_name": "宝马ai · gpt-6-sol", "group_name": GROUP_NAME,
        "type": "openai", "base_url": BASE_URL, "api_key": key,
        "tooltip_data": "宝马ai", "model_id": MODEL_ID,
        "reasoning_effort": effort, "openai_endpoint": "/v1/responses"
    }))?)
}

pub async fn disconnect(State(service): State<ControlService>) -> Result<Json<Value>> {
    let _guard = service.gateway_lock.lock().await;
    if let Some(model) = current(&service).await? {
        service.store.delete_model(&model.model_hash).await?;
    }
    Ok(Json(view(None)))
}

async fn key(service: &ControlService) -> Result<String> {
    current(service)
        .await?
        .map(|m| m.api_key)
        .ok_or_else(|| Error::Config("请先输入 Key 并连接".into()))
}

pub async fn usage(State(service): State<ControlService>) -> Result<Json<Value>> {
    let data = fetch(&key(&service).await?, "/v1/usage", &[]).await?;
    // 不把共用账户的钱包余额显示为个人余额。
    Ok(Json(
        json!({ "quota": data.get("quota"), "usage": data.get("usage"), "status": data.get("status") }),
    ))
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
    let data = fetch(&key(&service).await?, "/bmapi/v1/records", &query).await?;
    if data.get("code").and_then(Value::as_i64) != Some(0) || !data["data"]["items"].is_array() {
        return Err(Error::Provider("账单数据格式不正确".into()));
    }
    Ok(Json(data["data"].clone()))
}

#[cfg(test)]
mod tests {
    use super::*;

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
