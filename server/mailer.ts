import nodemailer from 'nodemailer';
import fs from 'node:fs';

if (process.env.MAIL_CONFIG_FILE) {
  const saved = JSON.parse(fs.readFileSync(process.env.MAIL_CONFIG_FILE, 'utf8'));
  for (const key of ['SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASS','SMTP_FROM']) {
    if (!process.env[key] && typeof saved[key] === 'string') process.env[key] = saved[key];
  }
}

export const mailBrand = '北京市青年铸牢中华民族共同体意识文创设计大赛';
export function mailContent(code: string, purpose: 'register' | 'login') {
  if (!/^\d{6}$/.test(code)) throw new Error('验证码格式错误');
  const action = purpose === 'register' ? '注册' : '登录';
  const subject = `【${mailBrand}】${action}验证码`;
  const text = `你正在${action}${mailBrand}投票平台。\n验证码：${code}\n验证码10分钟内有效，请勿转发或告知他人。\n若非本人操作，请忽略此邮件。\n活动网站：https://vote.wlbycuc.cn`;
  const html = `<div style="font-family:Arial,sans-serif;line-height:1.8;color:#263349;max-width:560px;margin:auto;padding:24px"><h2>${mailBrand}</h2><p>你正在${action}大赛投票平台，请填写以下验证码：</p><p style="font-size:32px;letter-spacing:8px;color:#a52d2d;font-weight:bold">${code}</p><p>验证码10分钟内有效，请勿转发或告知他人。</p><p>若非本人操作，请忽略此邮件。</p><a href="https://vote.wlbycuc.cn">进入大赛投票平台</a></div>`;
  return { subject, text, html };
}

export function mailTransport() {
  for (const key of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']) if (!process.env[key]) throw new Error('邮件服务暂不可用，请稍后重试');
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_SECURE !== 'false',
    requireTLS: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000,
    disableFileAccess: true, disableUrlAccess: true
  });
}

export async function sendEmailCode(email: string, code: string, purpose: 'register' | 'login') {
  const transport = mailTransport();
  try {
    const info = await transport.sendMail({ from: { name: mailBrand, address: process.env.SMTP_FROM! }, to: email, ...mailContent(code, purpose) });
    if (!info.accepted.length || info.rejected.length) throw new Error('邮件未被接收');
  } catch {
    // SMTP errors can include recipients or credentials; do not expose the raw error.
    throw new Error('验证邮件发送失败，请稍后重试');
  } finally { transport.close(); }
}
