const https = require('https');

const payload = JSON.stringify({
  DeviceId: '',
  TokenNo: 'EHVI-AODJ-AFWX-DOWB-ECVZ',
  UserName: 'bd-husmerk',
  DBType: 'Nusign',
  PlayerType: 'WebOS'
});

const options = {
  hostname: 'applicationaddons.com',
  port: 443,
  path: '/api/AppLogin',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload)
  }
};

const req = https.request(options, (res) => {
  console.log('Status:', res.statusCode);
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    console.log('Body:', data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e.message);
});

req.write(payload);
req.end();
