try {
  require('/root/projects/alisio-pms/.next/server/app/api/payments/route.js');
  console.log('OK - loaded successfully');
} catch(e) {
  console.error('LOAD ERROR:', e.message);
  console.error(e.stack && e.stack.split('\n').slice(0,5).join('\n'));
}
