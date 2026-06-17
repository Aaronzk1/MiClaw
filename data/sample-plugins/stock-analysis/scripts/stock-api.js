/**
 * 股票分析插件 - API实现
 * 数据源: 腾讯行情API + 东财财务API
 * 
 * 腾讯行情: https://qt.gtimg.cn/q=sh600519
 * 东财财务: https://push2.eastmoney.com/
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/**
 * 获取实时行情（腾讯API）
 * @param {string} code - 股票代码，如 600519
 * @returns {object} 行情数据
 */
async function quote(code) {
  const qqCode = code.startsWith('6') || code.startsWith('5') || code.startsWith('9') 
    ? 'sh' + code 
    : 'sz' + code
  
  const resp = await fetch(`https://qt.gtimg.cn/q=${qqCode}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(5000)
  })
  
  const buffer = await resp.arrayBuffer()
  const text = new TextDecoder('gbk').decode(buffer)
  const match = text.match(/="([^"]+)"/)
  
  if (!match) return { error: '未找到股票数据' }
  
  const parts = match[1].split('~')
  if (parts.length < 35) return { error: '数据格式错误' }
  
  return {
    name: parts[1],
    code: parts[2],
    price: parseFloat(parts[3]),
    prevClose: parseFloat(parts[4]),
    open: parseFloat(parts[5]),
    change: parseFloat(parts[31]),
    changePercent: parseFloat(parts[32]),
    high: parseFloat(parts[33]),
    low: parseFloat(parts[34]),
    volume: parseInt(parts[6]) * 100,
    time: parts[30]
  }
}

/**
 * 获取财务数据（东财API）
 * @param {string} code - 股票代码
 * @returns {object} 财务数据
 */
async function finance(code) {
  const secid = code.startsWith('6') || code.startsWith('5') || code.startsWith('9')
    ? '1.' + code
    : '0.' + code
  
  const resp = await fetch(`https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=f57,f58,f43,f44,f45,f46,f47,f48,f50,f51,f52,f55,f116,f117,f162,f167,f170`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(5000)
  })
  
  const data = await resp.json()
  if (!data?.data) return { error: '未找到财务数据' }
  
  const d = data.data
  return {
    code: d.f57,
    name: d.f58,
    price: (d.f43 || 0) / 100,
    pe: d.f162 || 0,
    pb: d.f167 || 0,
    marketCap: (d.f116 || 0) / 100000000,
    roe: d.f170 || 0
  }
}

/**
 * 获取K线数据（腾讯API）
 * @param {string} code - 股票代码
 * @param {string} period - 周期: daily/weekly/monthly
 * @returns {array} K线数据
 */
async function kline(code, period = 'daily') {
  const qqCode = code.startsWith('6') || code.startsWith('5') || code.startsWith('9')
    ? 'sh' + code
    : 'sz' + code
  
  const periodMap = { daily: 'day', weekly: 'week', monthly: 'month' }
  const p = periodMap[period] || 'day'
  
  const resp = await fetch(`https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${qqCode},${p},,,10,qfq`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(5000)
  })
  
  const data = await resp.json()
  const klines = data?.data?.[qqCode]?.[p] || data?.data?.[qqCode]?.qfqweek || []
  
  return klines.map(k => ({
    date: k[0],
    open: parseFloat(k[1]),
    close: parseFloat(k[2]),
    high: parseFloat(k[3]),
    low: parseFloat(k[4]),
    volume: parseInt(k[5])
  }))
}

// 导出
module.exports = { quote, finance, kline }
