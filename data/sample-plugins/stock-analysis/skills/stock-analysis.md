# 股票分析技能

## 核心工具
- stock-quote(code='股票代码') → 实时行情（腾讯API）
- stock-kline(code='股票代码', period='daily') → K线数据（腾讯API）
- stock-finance(code='股票代码') → 财务数据（东财API）

## 数据来源
- 行情数据: 腾讯行情API (qt.gtimg.cn)
- 财务数据: 东方财富API (push2.eastmoney.com)
- K线数据: 腾讯K线API (web.ifzq.gtimg.cn)

## 使用流程
1. 用户问股票 → 先确认股票代码
2. 调用 stock-quote 获取实时行情
3. 需要历史数据 → 调用 stock-kline
4. 需要财务分析 → 调用 stock-finance
5. 整理成报告返回给用户

## 股票代码规则
- 6位数字: 600519(茅台)、002050(三花智控)
- 不需要加 sh/sz 前缀，工具自动识别
- 上交所: 6开头、5开头、9开头
- 深交所: 0开头、3开头

## 输出格式
简洁明了，关键数据突出显示:
- 股价: XX元 (涨跌幅)
- 成交量: XX万手
- 市盈率: XX倍
- 市值: XX亿

## 注意事项
- 数据有延迟，仅供参考
- 不构成投资建议
- 历史数据不代表未来表现
