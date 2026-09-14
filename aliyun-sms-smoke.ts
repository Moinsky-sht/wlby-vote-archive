import assert from 'node:assert/strict';
import fs from 'node:fs';
import { signRpcParams, sendAliyunRegistrationCode } from './server/aliyunSms.ts';
import { registrationSmsConfigured, sendRegistrationSmsCode } from './server/sms.ts';

// Official RPC signature vector; fake credentials are used only in this test.
assert.equal(signRpcParams({ Timestamp:'2016-02-23T12:46:24Z',Format:'XML',AccessKeyId:'testid',Action:'DescribeRegions',SignatureMethod:'HMAC-SHA1',SignatureNonce:'3ee8c1b8-83d3-44af-a94f-4e0ad82fd6cf',Version:'2014-05-26',SignatureVersion:'1.0' }, 'testsecret', 'GET'), 'OLeaidS1JvxuMvnyHOwuJ+uX5qY=');
const envBefore = { ...process.env }, realFetch = globalThis.fetch;
let calls = 0;
try {
  process.env.SMS_PROVIDER = 'aliyun';
  delete process.env.ALIYUN_SMS_SIGN_NAME;
  assert.equal(registrationSmsConfigured(), false);
  await assert.rejects(() => sendRegistrationSmsCode('13800000001','123456'), /暂未开通/);
  Object.assign(process.env, { ALIYUN_ACCESS_KEY_ID:'testid', ALIYUN_ACCESS_KEY_SECRET:'testsecret', ALIYUN_SMS_SIGN_NAME:'测试签名', ALIYUN_SMS_TEMPLATE_CODE:'100001' });
  assert.equal(registrationSmsConfigured(), true);
  globalThis.fetch = (async (url, options) => {
    calls++;
    assert.equal(url, 'https://dypnsapi.aliyuncs.com/');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.redirect, 'error');
    const body = new URLSearchParams(String(options?.body));
    assert.equal(body.get('Action'), 'SendSmsVerifyCode');
    assert.equal(body.get('PhoneNumber'), '13800000001');
    assert.deepEqual(JSON.parse(body.get('TemplateParam')!), {code:'123456',min:'10'});
    assert.equal(body.get('ReturnVerifyCode'), 'false');
    assert.equal(body.get('ValidTime'), '600');
    assert.equal(body.get('Interval'), '120');
    const signature = body.get('Signature'); body.delete('Signature');
    assert.equal(signature, signRpcParams(Object.fromEntries(body), 'testsecret'));
    return Response.json({Code:'OK',Success:true});
  }) as typeof fetch;
  await sendRegistrationSmsCode('13800000001','123456');
  assert.equal(calls,1);
  await assert.rejects(() => sendAliyunRegistrationCode('bad','123456'), /参数无效/);
  assert.equal(calls,1);
  for (const payload of [{Code:'OK',Success:false},{Code:'FREQUENCY_FAIL',Success:true},{}]) {
    globalThis.fetch = (async () => { calls++; return Response.json(payload); }) as typeof fetch;
    await assert.rejects(() => sendRegistrationSmsCode('13800000001','123456'), /暂不可用/);
  }
  globalThis.fetch = (async () => { calls++; throw new Error('sensitive provider detail'); }) as typeof fetch;
  await assert.rejects(() => sendRegistrationSmsCode('13800000001','123456'), error => error instanceof Error && !error.message.includes('sensitive'));
  assert.equal(calls,5, 'Failed requests must not be retried or sent to another provider');
  process.env.SMS_PROVIDER = 'unknown'; assert.equal(registrationSmsConfigured(),false);
  const intro = fs.readFileSync('src/pages/IntroPage.vue','utf8');
  assert.ok(intro.includes('contest-banner.json'));
  assert.ok(intro.includes('object-fit:contain'));
  assert.ok(!intro.includes('IntroHero_bg_v3'));
  const auth = fs.readFileSync('server/userAuth.ts','utf8');
  assert.ok(auth.includes('auth:sms:budget'));
  assert.ok(auth.includes('SMS_DAILY_SEND_LIMIT'));
  console.log('PASS: official signature vector, correct provider/body, fail-closed configuration, honest errors, no retry or mock delivery, intro banner');
} finally {
  globalThis.fetch = realFetch;
  for (const key of Object.keys(process.env)) if (!(key in envBefore)) delete process.env[key];
  Object.assign(process.env,envBefore);
}
