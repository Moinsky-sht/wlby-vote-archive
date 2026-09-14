import crypto from 'node:crypto';

const endpoint = 'https://sms.tencentcloudapi.com/';
const host = 'sms.tencentcloudapi.com';
const service = 'sms';
const action = 'SendSms';
const version = '2021-01-11';

const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const hmac = (key: crypto.BinaryLike | crypto.KeyObject, value: string) =>
  crypto.createHmac('sha256', key).update(value).digest();

function smsConfig() {
  return {
    secretId: String(process.env.TENCENT_SMS_SECRET_ID || '').trim(),
    secretKey: String(process.env.TENCENT_SMS_SECRET_KEY || '').trim(),
    region: String(process.env.TENCENT_SMS_REGION || 'ap-guangzhou').trim(),
    sdkAppId: String(process.env.TENCENT_SMS_SDK_APP_ID || '').trim(),
    signName: String(process.env.TENCENT_SMS_SIGN_NAME || '').trim(),
    templateId: String(process.env.TENCENT_SMS_TEMPLATE_ID || '').trim()
  };
}

function signedHeaders(payload: string, secretId: string, secretKey: string, region: string) {
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';
  const canonicalHeaders = `content-type:${contentType}\nhost:${host}\n`;
  const signedHeaderNames = 'content-type;host';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaderNames,
    sha256(payload)
  ].join('\n');
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    'TC3-HMAC-SHA256',
    timestamp,
    credentialScope,
    sha256(canonicalRequest)
  ].join('\n');
  const secretDate = hmac(`TC3${secretKey}`, date);
  const secretService = hmac(secretDate, service);
  const secretSigning = hmac(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex');
  const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaderNames}, Signature=${signature}`;

  return {
    Authorization: authorization,
    'Content-Type': contentType,
    Host: host,
    'X-TC-Action': action,
    'X-TC-Region': region,
    'X-TC-Timestamp': String(timestamp),
    'X-TC-Version': version
  };
}

export async function sendRegistrationSmsCode(phone: string, code: string) {
  const config = smsConfig();
  if (!config.secretId || !config.secretKey || !config.sdkAppId || !config.signName || !config.templateId) {
    if (process.env.NODE_ENV === 'production') throw new Error('短信服务尚未完成配置');
    console.log('[sms-debug] 注册验证码已生成');
    return;
  }

  const payload = JSON.stringify({
    PhoneNumberSet: [`+86${phone}`],
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code]
  });
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: signedHeaders(payload, config.secretId, config.secretKey, config.region),
    body: payload,
    signal: AbortSignal.timeout(15_000)
  });
  const data = await response.json().catch(() => ({})) as {
    Response?: {
      Error?: { Code?: string; Message?: string };
      SendStatusSet?: Array<{ Code?: string; Message?: string }>;
    };
  };
  const providerError = data.Response?.Error;
  const sendStatus = data.Response?.SendStatusSet?.[0];
  if (!response.ok || providerError || !sendStatus || sendStatus.Code !== 'Ok') {
    const providerCode = providerError?.Code || sendStatus?.Code || `HTTP_${response.status}`;
    console.error(`[sms-error] ${providerCode}`);
    throw new Error('短信发送失败，请稍后再试');
  }
}
