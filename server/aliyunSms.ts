import crypto from 'node:crypto';

// Dypnsapi registration delivery. Codes are generated, HMAC-hashed and verified
// by userAuth.ts; the API explicitly supports a concrete TemplateParam.code.
// This is not Dysmsapi and does not use its SMS_* template resources.
const endpoint = 'https://dypnsapi.aliyuncs.com/';
export function aliyunSmsConfigured() {
  return ['ALIYUN_ACCESS_KEY_ID', 'ALIYUN_ACCESS_KEY_SECRET', 'ALIYUN_SMS_SIGN_NAME', 'ALIYUN_SMS_TEMPLATE_CODE']
    .every(key => Boolean(process.env[key]?.trim()));
}
function encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase());
}
export function signRpcParams(params: Record<string, string>, secret: string, method = 'POST') {
  const canonical = Object.keys(params).sort().map(key => encode(key) + '=' + encode(params[key])).join('&');
  return crypto.createHmac('sha1', secret + '&').update(method + '&%2F&' + encode(canonical)).digest('base64');
}
export async function sendAliyunRegistrationCode(phone: string, code: string) {
  if (!aliyunSmsConfigured()) throw new Error('短信服务尚未完成配置');
  if (!/^1\d{10}$/.test(phone) || !/^\d{6}$/.test(code)) throw new Error('短信参数无效');
  const params: Record<string, string> = {
    AccessKeyId: process.env.ALIYUN_ACCESS_KEY_ID!.trim(),
    Action: 'SendSmsVerifyCode', Version: '2017-05-25', Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1', SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(), Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    PhoneNumber: phone, CountryCode: '86',
    SignName: process.env.ALIYUN_SMS_SIGN_NAME!.trim(),
    TemplateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE!.trim(),
    TemplateParam: JSON.stringify({ code, min: '10' }),
    SchemeName: 'beijing-vote-register',
    CodeLength: '6', CodeType: '1', ValidTime: '600', Interval: '120',
    DuplicatePolicy: '1', ReturnVerifyCode: 'false', AutoRetry: '0',
    OutId: crypto.randomUUID()
  };
  params.Signature = signRpcParams(params, process.env.ALIYUN_ACCESS_KEY_SECRET!.trim());
  try {
    const response = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(15000), redirect: 'error'
    });
    const data = await response.json() as { Code?: string; Success?: boolean };
    if (!response.ok || data.Code !== 'OK' || data.Success !== true) {
      // Never log provider messages/responses, phone numbers, codes or request bodies.
      const providerCode = /^[A-Za-z0-9_.-]{1,80}$/.test(data.Code || '') ? data.Code : 'INVALID_RESPONSE';
      console.error('[aliyun-sms-error]', providerCode);
      throw new Error('短信发送失败');
    }
  } catch {
    throw new Error('短信服务暂不可用，请稍后重试');
  }
}
