// 創建15筆測試訂單的腳本
const testOrders = [
  {
    contact_name: "王大明",
    contact_phone: "0912345678",
    address: "新北市三峽區大勇路100號",
    items: [
      { product_id: 1, quantity: 2, unit_price: 80, weight: null },
      { product_id: 3, quantity: 1, unit_price: 40, weight: null }
    ]
  },
  {
    contact_name: "李小美",
    contact_phone: "0923456789",
    address: "新北市樹林區中山路200號",
    items: [
      { product_id: 2, quantity: 1, unit_price: 120, weight: 1.5 },
      { product_id: 5, quantity: 1, unit_price: 60, weight: null }
    ]
  },
  {
    contact_name: "陳志強",
    contact_phone: "0934567890",
    address: "新北市土城區金城路300號",
    items: [
      { product_id: 1, quantity: 1, unit_price: 80, weight: null },
      { product_id: 7, quantity: 2, unit_price: 50, weight: null }
    ]
  },
  {
    contact_name: "林雅婷",
    contact_phone: "0945678901",
    address: "新北市鶯歌區文化路400號",
    items: [
      { product_id: 9, quantity: 3, unit_price: 80, weight: null },
      { product_id: 4, quantity: 1, unit_price: 90, weight: 1.2 }
    ]
  },
  {
    contact_name: "張家豪",
    contact_phone: "0956789012",
    address: "新北市三峽區民族路150號",
    items: [
      { product_id: 8, quantity: 2, unit_price: 45, weight: 2.0 },
      { product_id: 3, quantity: 1, unit_price: 40, weight: null }
    ]
  },
  {
    contact_name: "黃淑芬",
    contact_phone: "0967890123",
    address: "新北市樹林區保安路250號",
    items: [
      { product_id: 6, quantity: 1, unit_price: 70, weight: 1.0 },
      { product_id: 5, quantity: 2, unit_price: 60, weight: null }
    ]
  },
  {
    contact_name: "劉建國",
    contact_phone: "0978901234",
    address: "新北市土城區學府路350號",
    items: [
      { product_id: 1, quantity: 1, unit_price: 80, weight: null },
      { product_id: 9, quantity: 2, unit_price: 80, weight: null }
    ]
  },
  {
    contact_name: "吳佩珊",
    contact_phone: "0989012345",
    address: "新北市鶯歌區尖山路450號",
    items: [
      { product_id: 2, quantity: 1, unit_price: 100, weight: 1.8 },
      { product_id: 7, quantity: 1, unit_price: 50, weight: null }
    ]
  },
  {
    contact_name: "徐志明",
    contact_phone: "0901234567",
    address: "新北市三峽區復興路180號",
    items: [
      { product_id: 4, quantity: 1, unit_price: 85, weight: 1.5 },
      { product_id: 8, quantity: 1, unit_price: 45, weight: 1.0 }
    ]
  },
  {
    contact_name: "蔡美玲",
    contact_phone: "0912345679",
    address: "新北市樹林區樹新路280號",
    items: [
      { product_id: 3, quantity: 3, unit_price: 40, weight: null },
      { product_id: 6, quantity: 1, unit_price: 65, weight: 0.8 }
    ]
  },
  {
    contact_name: "郭俊傑",
    contact_phone: "0923456780",
    address: "新北市土城區中央路380號",
    items: [
      { product_id: 5, quantity: 2, unit_price: 60, weight: null },
      { product_id: 9, quantity: 1, unit_price: 80, weight: null }
    ]
  },
  {
    contact_name: "洪雅慧",
    contact_phone: "0934567891",
    address: "新北市鶯歌區建國路480號",
    items: [
      { product_id: 1, quantity: 2, unit_price: 80, weight: null },
      { product_id: 2, quantity: 1, unit_price: 110, weight: 1.3 }
    ]
  },
  {
    contact_name: "楊志偉",
    contact_phone: "0945678902",
    address: "新北市三峽區學勤路220號",
    items: [
      { product_id: 7, quantity: 2, unit_price: 50, weight: null },
      { product_id: 4, quantity: 1, unit_price: 95, weight: 1.6 }
    ]
  },
  {
    contact_name: "謝淑真",
    contact_phone: "0956789013",
    address: "新北市樹林區中正路320號",
    items: [
      { product_id: 8, quantity: 1, unit_price: 45, weight: 1.2 },
      { product_id: 6, quantity: 1, unit_price: 75, weight: 1.1 }
    ]
  },
  {
    contact_name: "鄭家銘",
    contact_phone: "0967890124",
    address: "新北市鶯歌區光復路520號",
    items: [
      { product_id: 9, quantity: 2, unit_price: 80, weight: null },
      { product_id: 3, quantity: 2, unit_price: 40, weight: null },
      { product_id: 5, quantity: 1, unit_price: 60, weight: null }
    ]
  }
];

// 計算總金額的函數
function calculateTotal(items) {
  return items.reduce((total, item) => {
    return total + (item.unit_price * (item.weight || item.quantity));
  }, 0);
}

// 輸出訂單創建的curl指令
console.log('=== 創建15筆測試訂單的腳本 ===\n');

testOrders.forEach((order, index) => {
  const totalAmount = calculateTotal(order.items);
  
  const orderData = {
    contact_name: order.contact_name,
    contact_phone: order.contact_phone,
    address: order.address,
    total_amount: totalAmount,
    status: 'pending',
    items: order.items
  };
  
  const curlCommand = `curl -X POST "https://vegdeliverydbupdated-rg5yg4omu-shi-jia-huangs-projects.vercel.app/api/orders" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(orderData)}'`;
  
  console.log(`# 訂單 ${index + 1}: ${order.contact_name} - ${order.address}`);
  console.log(`# 總金額: $${totalAmount}`);
  console.log(curlCommand);
  console.log('');
});

console.log('\n=== 完成！===');