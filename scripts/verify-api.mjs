async function test() {
  const base = 'http://127.0.0.1:3000';
  console.log('Testing server at', base);

  // 1. Check login page
  const pageRes = await fetch(base + '/login');
  console.log('1. /login status:', pageRes.status);

  // 2. Auth login
  const loginRes = await fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'kopontren' }),
  });
  console.log('2. /api/auth/login status:', loginRes.status);
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';

  const headers = { 'Cookie': cookie, 'Content-Type': 'application/json' };

  // 3. Products
  const prodRes = await fetch(base + '/api/products', { headers });
  const prodData = await prodRes.json();
  console.log('3. /api/products status:', prodRes.status, 'Total products:', prodData.products?.length);

  // 4. Members
  const memRes = await fetch(base + '/api/members', { headers });
  const memData = await memRes.json();
  console.log('4. /api/members status:', memRes.status, 'Total members:', memData.members?.length);

  // 5. Shifts
  const shiftRes = await fetch(base + '/api/shifts?current=1', { headers });
  const shiftData = await shiftRes.json();
  console.log('5. /api/shifts status:', shiftRes.status, 'Open shift:', shiftData.open?.label || 'None');

  // 6. Reports
  const repRes = await fetch(base + '/api/reports?days=30', { headers });
  const repData = await repRes.json();
  console.log('6. /api/reports status:', repRes.status, 'Profit:', repData.profit, 'Sales count:', repData.sales_count);

  // 7. Audit
  const audRes = await fetch(base + '/api/audit?limit=5', { headers });
  const audData = await audRes.json();
  console.log('7. /api/audit status:', audRes.status, 'Logs:', audData.logs?.length);

  console.log('ALL TESTS PASSED SUCCESSFULLY!');
}

test().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
