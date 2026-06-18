async function test() {
  try {
    const res = await fetch('https://www.irctc.co.in/eticketing/trainList?q=1295', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36'
      }
    });
    console.log("GET body:", await res.text());
  } catch (e) {
    console.error("GET error:", e);
  }
}
test();
