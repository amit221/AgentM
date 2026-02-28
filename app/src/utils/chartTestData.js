/**
 * Sample data for testing chart functionality
 */

// Sample aggregation result - Sales by Product (perfect for bar chart + summary)
export const salesByProduct = [
  { _id: "iPhone", totalSales: 50000, count: 120, avgPrice: 417 },
  { _id: "iPad", totalSales: 30000, count: 85, avgPrice: 353 },
  { _id: "MacBook", totalSales: 25000, count: 45, avgPrice: 556 },
  { _id: "Apple Watch", totalSales: 15000, count: 200, avgPrice: 75 },
  { _id: "AirPods", totalSales: 12000, count: 300, avgPrice: 40 }
];

// Sample time series data (perfect for multi-line chart + summary)
export const monthlyRevenue = [
  { _id: "2024-01", totalRevenue: 45000, totalOrders: 150, avgOrderValue: 300 },
  { _id: "2024-02", totalRevenue: 52000, totalOrders: 180, avgOrderValue: 289 },
  { _id: "2024-03", totalRevenue: 48000, totalOrders: 165, avgOrderValue: 291 },
  { _id: "2024-04", totalRevenue: 61000, totalOrders: 210, avgOrderValue: 290 },
  { _id: "2024-05", totalRevenue: 58000, totalOrders: 195, avgOrderValue: 297 },
  { _id: "2024-06", totalRevenue: 67000, totalOrders: 230, avgOrderValue: 291 }
];

// Sample category distribution (perfect for pie chart)
export const ordersByRegion = [
  { _id: "North America", count: 450 },
  { _id: "Europe", count: 320 },
  { _id: "Asia", count: 280 },
  { _id: "South America", count: 150 },
  { _id: "Africa", count: 80 }
];

// Sample business metrics (perfect for summary cards)
export const businessMetrics = [
  { _id: "Q1 2024", totalRevenue: 2500000, totalOrders: 8500, avgOrderValue: 294, maxOrderValue: 1200, minOrderValue: 15 },
  { _id: "Q2 2024", totalRevenue: 2800000, totalOrders: 9200, avgOrderValue: 304, maxOrderValue: 1350, minOrderValue: 18 },
  { _id: "Q3 2024", totalRevenue: 3100000, totalOrders: 9800, avgOrderValue: 316, maxOrderValue: 1400, minOrderValue: 20 },
  { _id: "Q4 2024", totalRevenue: 3400000, totalOrders: 10500, avgOrderValue: 324, maxOrderValue: 1500, minOrderValue: 22 }
];

// Sample data that's NOT suitable for charts
export const rawDocuments = [
  { 
    _id: "507f1f77bcf86cd799439011", 
    name: "John Doe", 
    email: "john@example.com",
    profile: { age: 30, city: "New York" }
  },
  { 
    _id: "507f1f77bcf86cd799439012", 
    name: "Jane Smith", 
    email: "jane@example.com",
    profile: { age: 25, city: "Los Angeles" }
  }
];

// Test function to verify chart suitability detection
export function testChartSuitability() {
  console.log('Testing chart suitability detection:');
  console.log('Chart analysis is now handled by the AI backend');
  
  // Test data validation
  console.log('Sales by Product data length:', salesByProduct.length);
  console.log('Monthly Revenue data length:', monthlyRevenue.length);  
  console.log('Orders by Region data length:', ordersByRegion.length);
  console.log('Raw Documents data length:', rawDocuments.length);
}

// Export test data sets
export const testDataSets = {
  suitable: {
    salesByProduct,
    monthlyRevenue, 
    ordersByRegion,
    businessMetrics
  },
  unsuitable: {
    rawDocuments,
    emptyArray: [],
    singleItem: [{ _id: "test", value: 1 }],
    tooManyItems: Array(1500).fill().map((_, i) => ({ _id: `item${i}`, value: i }))
  }
};
