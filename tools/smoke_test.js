const https = require('https');

const SERVER = 'applicationaddons.com';
const API_BASE = '/api/';

function post(path, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload || {});
    const options = {
      hostname: SERVER,
      port: 443,
      path: API_BASE + path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 15000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('timeout', () => { req.destroy(new Error('timeout')); });
    req.on('error', (e) => reject(e));
    req.write(data);
    req.end();
  });
}

(async function run() {
  try {
    console.log('SMOKE: AppLogin');
    const login = await post('AppLogin', {
      DeviceId: '',
      TokenNo: 'EHVI-AODJ-AFWX-DOWB-ECVZ',
      UserName: 'bd-husmerk',
      DBType: 'Nusign',
      PlayerType: 'WebOS'
    });
    console.log('AppLogin ->', login.status, login.body.slice(0, 400));

    console.log('\nSMOKE: GetPlaylistsSchedule');
    const sched = await post('GetPlaylistsSchedule', { DfClientId: '', TokenId: '', WeekNo: '' });
    console.log('GetPlaylistsSchedule ->', sched.status, sched.body.slice(0, 400));

    console.log('\nSMOKE: GetPlaylistsContent');
    const content = await post('GetPlaylistsContent', { splPlaylistId: '' });
    console.log('GetPlaylistsContent ->', content.status, content.body.slice(0, 400));

    console.log('\nSMOKE: AdvtSchedule');
    const adv = await post('AdvtSchedule', { Cityid: '', CountryId: '', CurrentDate: '', DfClientId: '', StateId: '', TokenId: '', WeekNo: '' });
    console.log('AdvtSchedule ->', adv.status, adv.body.slice(0, 400));

    console.log('\nSMOKE: GetTokenContent');
    const tokenContent = await post('GetTokenContent', { tokenId: '' });
    console.log('GetTokenContent ->', tokenContent.status, tokenContent.body.slice(0, 400));

    console.log('\nSMOKE: finished');
  } catch (err) {
    console.error('SMOKE ERROR:', err && err.message ? err.message : err);
    process.exitCode = 2;
  }
})();
