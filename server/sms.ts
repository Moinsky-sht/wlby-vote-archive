import { aliyunSmsConfigured, sendAliyunRegistrationCode } from './aliyunSms.js';
import { sendRegistrationSmsCode as sendTencentCode } from './tencentSms.js';

export function registrationSmsConfigured() {
  if (process.env.SMS_PROVIDER === 'aliyun') return aliyunSmsConfigured();
  if (process.env.SMS_PROVIDER && process.env.SMS_PROVIDER !== 'tencent') return false;
  return ['TENCENT_SMS_SECRET_ID', 'TENCENT_SMS_SECRET_KEY', 'TENCENT_SMS_SDK_APP_ID', 'TENCENT_SMS_SIGN_NAME', 'TENCENT_SMS_TEMPLATE_ID']
    .every(key => Boolean(process.env[key]?.trim()));
}
export async function sendRegistrationSmsCode(phone: string, code: string) {
  // No silent mock delivery or fallback provider (which could double-charge).
  if (!registrationSmsConfigured()) throw new Error('短信注册暂不可用，请稍后重试');
  if (process.env.SMS_PROVIDER === 'aliyun') return sendAliyunRegistrationCode(phone, code);
  return sendTencentCode(phone, code);
}
