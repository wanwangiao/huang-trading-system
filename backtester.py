"""
專業級交易策略回測引擎
支援事件驅動、向量化和多資產組合回測
"""

import pandas as pd
import numpy as np
from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Tuple, Any, Union
from dataclasses import dataclass, field
from enum import Enum
import logging
import warnings
from datetime import datetime, timedelta
import copy

# 設定日誌
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OrderType(Enum):
    """訂單類型"""
    MARKET = "market"
    LIMIT = "limit"
    STOP = "stop"
    STOP_LIMIT = "stop_limit"

class OrderSide(Enum):
    """訂單方向"""
    BUY = "buy"
    SELL = "sell"

class OrderStatus(Enum):
    """訂單狀態"""
    PENDING = "pending"
    FILLED = "filled"
    PARTIAL = "partial"
    CANCELLED = "cancelled"
    REJECTED = "rejected"

@dataclass
class Order:
    """訂單類別"""
    symbol: str
    side: OrderSide
    order_type: OrderType
    quantity: float
    price: Optional[float] = None
    stop_price: Optional[float] = None
    timestamp: Optional[datetime] = None
    order_id: Optional[str] = None
    status: OrderStatus = OrderStatus.PENDING
    filled_quantity: float = 0.0
    filled_price: float = 0.0
    commission: float = 0.0
    slippage: float = 0.0

@dataclass
class Position:
    """持倉類別"""
    symbol: str
    quantity: float = 0.0
    avg_price: float = 0.0
    market_value: float = 0.0
    unrealized_pnl: float = 0.0
    realized_pnl: float = 0.0
    
    def update_position(self, trade_quantity: float, trade_price: float, 
                       current_price: float):
        """更新持倉"""
        if self.quantity == 0:
            # 新開倉
            self.quantity = trade_quantity
            self.avg_price = trade_price
        else:
            # 加倉或減倉
            if np.sign(trade_quantity) == np.sign(self.quantity):
                # 加倉
                total_cost = self.quantity * self.avg_price + trade_quantity * trade_price
                self.quantity += trade_quantity
                self.avg_price = total_cost / self.quantity if self.quantity != 0 else 0
            else:
                # 減倉或平倉
                if abs(trade_quantity) >= abs(self.quantity):
                    # 完全平倉或反向
                    self.realized_pnl += (trade_price - self.avg_price) * self.quantity
                    remaining_quantity = trade_quantity + self.quantity
                    if remaining_quantity != 0:
                        self.quantity = remaining_quantity
                        self.avg_price = trade_price
                    else:
                        self.quantity = 0
                        self.avg_price = 0
                else:
                    # 部分平倉
                    self.realized_pnl += (trade_price - self.avg_price) * abs(trade_quantity)
                    self.quantity += trade_quantity
        
        # 更新市值和未實現損益
        self.market_value = self.quantity * current_price
        if self.quantity != 0:
            self.unrealized_pnl = (current_price - self.avg_price) * self.quantity

@dataclass
class Portfolio:
    """投資組合類別"""
    initial_capital: float
    cash: float
    positions: Dict[str, Position] = field(default_factory=dict)
    total_value: float = 0.0
    margin_used: float = 0.0
    margin_available: float = 0.0
    leverage: float = 1.0
    
    def get_position(self, symbol: str) -> Position:
        """獲取持倉"""
        if symbol not in self.positions:
            self.positions[symbol] = Position(symbol)
        return self.positions[symbol]
    
    def update_portfolio(self, prices: Dict[str, float]):
        """更新投資組合"""
        total_market_value = 0.0
        total_unrealized_pnl = 0.0
        total_realized_pnl = 0.0
        
        for symbol, position in self.positions.items():
            if position.quantity != 0 and symbol in prices:
                position.update_position(0, 0, prices[symbol])
                total_market_value += abs(position.market_value)
                total_unrealized_pnl += position.unrealized_pnl
                total_realized_pnl += position.realized_pnl
        
        self.total_value = self.cash + total_market_value
        self.margin_used = total_market_value / self.leverage
        self.margin_available = self.cash - self.margin_used
        
        return {
            'total_value': self.total_value,
            'cash': self.cash,
            'market_value': total_market_value,
            'unrealized_pnl': total_unrealized_pnl,
            'realized_pnl': total_realized_pnl,
            'margin_used': self.margin_used,
            'margin_available': self.margin_available
        }

class TradingCostModel:
    """交易成本模型"""
    
    def __init__(self, 
                 commission_rate: float = 0.001,
                 commission_min: float = 1.0,
                 slippage_rate: float = 0.0005,
                 impact_coeff: float = 0.1):
        self.commission_rate = commission_rate
        self.commission_min = commission_min
        self.slippage_rate = slippage_rate
        self.impact_coeff = impact_coeff
    
    def calculate_costs(self, order: Order, market_data: Dict) -> Tuple[float, float]:
        """計算交易成本"""
        # 佣金計算
        commission = max(
            order.quantity * order.filled_price * self.commission_rate,
            self.commission_min
        )
        
        # 滑點計算 (簡化模型)
        base_slippage = order.filled_price * self.slippage_rate
        
        # 市場衝擊 (基於訂單大小)
        avg_volume = market_data.get('avg_volume', 1000000)
        impact = (order.quantity / avg_volume) * self.impact_coeff * order.filled_price
        
        total_slippage = base_slippage + impact
        
        return commission, total_slippage

class RiskManager:
    """風險管理器"""
    
    def __init__(self,
                 max_position_size: float = 0.1,
                 max_portfolio_risk: float = 0.02,
                 max_drawdown: float = 0.2,
                 var_limit: float = 0.05):
        self.max_position_size = max_position_size
        self.max_portfolio_risk = max_portfolio_risk
        self.max_drawdown = max_drawdown
        self.var_limit = var_limit
        self.peak_value = 0.0
        self.current_drawdown = 0.0
    
    def check_order(self, order: Order, portfolio: Portfolio, 
                   market_data: Dict) -> Tuple[bool, str]:
        """檢查訂單風險"""
        # 檢查持倉大小限制
        position = portfolio.get_position(order.symbol)
        new_quantity = position.quantity
        
        if order.side == OrderSide.BUY:
            new_quantity += order.quantity
        else:
            new_quantity -= order.quantity
        
        position_value = abs(new_quantity * market_data.get(order.symbol, 0))
        position_weight = position_value / portfolio.total_value
        
        if position_weight > self.max_position_size:
            return False, f"Position size exceeds limit: {position_weight:.3f} > {self.max_position_size:.3f}"
        
        # 檢查保證金
        if portfolio.margin_available < 0:
            return False, "Insufficient margin"
        
        # 檢查最大回撤
        if portfolio.total_value > self.peak_value:
            self.peak_value = portfolio.total_value
        
        self.current_drawdown = (self.peak_value - portfolio.total_value) / self.peak_value
        
        if self.current_drawdown > self.max_drawdown:
            return False, f"Maximum drawdown exceeded: {self.current_drawdown:.3f} > {self.max_drawdown:.3f}"
        
        return True, "Order approved"
    
    def update_risk_metrics(self, portfolio: Portfolio):
        """更新風險指標"""
        if portfolio.total_value > self.peak_value:
            self.peak_value = portfolio.total_value
        
        self.current_drawdown = (self.peak_value - portfolio.total_value) / self.peak_value
        
        return {
            'peak_value': self.peak_value,
            'current_drawdown': self.current_drawdown,
            'var_estimate': self.estimate_var(portfolio)
        }
    
    def estimate_var(self, portfolio: Portfolio, confidence: float = 0.95) -> float:
        """估算風險價值 (簡化版)"""
        # 這裡使用簡化的VaR估算，實際應用中需要更複雜的模型
        portfolio_volatility = 0.02  # 假設投資組合日波動率為2%
        from scipy import stats
        var_multiplier = stats.norm.ppf(1 - confidence)
        return portfolio.total_value * portfolio_volatility * abs(var_multiplier)

class Strategy(ABC):
    """策略基礎類別"""
    
    @abstractmethod
    def generate_signals(self, data: pd.DataFrame, timestamp: datetime) -> List[Order]:
        """生成交易信號"""
        pass
    
    @abstractmethod
    def get_required_data(self) -> List[str]:
        """獲取所需數據欄位"""
        pass

class BacktestEngine:
    """回測引擎"""
    
    def __init__(self,
                 initial_capital: float = 1000000,
                 commission_rate: float = 0.001,
                 slippage_rate: float = 0.0005,
                 leverage: float = 1.0):
        
        self.portfolio = Portfolio(
            initial_capital=initial_capital,
            cash=initial_capital,
            leverage=leverage
        )
        
        self.cost_model = TradingCostModel(
            commission_rate=commission_rate,
            slippage_rate=slippage_rate
        )
        
        self.risk_manager = RiskManager()
        
        # 記錄交易和績效
        self.trades: List[Dict] = []
        self.portfolio_history: List[Dict] = []
        self.orders: List[Order] = []
        
        # 市場數據
        self.market_data: Optional[pd.DataFrame] = None
        self.current_prices: Dict[str, float] = {}
        
    def load_data(self, data: pd.DataFrame, price_column: str = 'close'):
        """載入市場數據"""
        self.market_data = data.copy()
        if 'timestamp' not in self.market_data.columns:
            self.market_data['timestamp'] = self.market_data.index
        
        # 確保數據按時間排序
        self.market_data = self.market_data.sort_values('timestamp')
        
        logger.info(f"Loaded {len(self.market_data)} data points")
        logger.info(f"Data range: {self.market_data['timestamp'].min()} to {self.market_data['timestamp'].max()}")
    
    def execute_order(self, order: Order, timestamp: datetime) -> bool:
        """執行訂單"""
        symbol = order.symbol
        
        # 獲取當前價格
        if symbol not in self.current_prices:
            logger.warning(f"No price data for {symbol} at {timestamp}")
            return False
        
        current_price = self.current_prices[symbol]
        
        # 設定成交價格 (簡化處理)
        if order.order_type == OrderType.MARKET:
            fill_price = current_price
        elif order.order_type == OrderType.LIMIT:
            if order.price is None:
                return False
            
            if order.side == OrderSide.BUY:
                if current_price <= order.price:
                    fill_price = order.price
                else:
                    return False
            else:
                if current_price >= order.price:
                    fill_price = order.price
                else:
                    return False
        else:
            # 其他訂單類型的處理
            fill_price = current_price
        
        # 風險檢查
        risk_approved, risk_msg = self.risk_manager.check_order(
            order, self.portfolio, self.current_prices
        )
        
        if not risk_approved:
            logger.warning(f"Order rejected: {risk_msg}")
            order.status = OrderStatus.REJECTED
            return False
        
        # 計算交易成本
        order.filled_price = fill_price
        order.filled_quantity = order.quantity
        
        market_info = {'avg_volume': 1000000}  # 簡化市場資訊
        commission, slippage = self.cost_model.calculate_costs(order, market_info)
        
        order.commission = commission
        order.slippage = slippage
        order.status = OrderStatus.FILLED
        order.timestamp = timestamp
        
        # 更新持倉
        position = self.portfolio.get_position(symbol)
        
        trade_quantity = order.quantity if order.side == OrderSide.BUY else -order.quantity
        effective_price = fill_price
        
        if order.side == OrderSide.BUY:
            effective_price += slippage
        else:
            effective_price -= slippage
        
        position.update_position(trade_quantity, effective_price, current_price)
        
        # 更新現金
        trade_value = order.quantity * effective_price
        total_cost = trade_value + commission
        
        if order.side == OrderSide.BUY:
            self.portfolio.cash -= total_cost
        else:
            self.portfolio.cash += trade_value - commission
        
        # 記錄交易
        trade_record = {
            'timestamp': timestamp,
            'symbol': symbol,
            'side': order.side.value,
            'quantity': order.quantity,
            'price': effective_price,
            'commission': commission,
            'slippage': slippage,
            'total_cost': total_cost,
            'cash_after': self.portfolio.cash
        }
        
        self.trades.append(trade_record)
        
        logger.info(f"Trade executed: {symbol} {order.side.value} {order.quantity}@{effective_price:.4f}")
        
        return True
    
    def run_backtest(self, strategy: Strategy, start_date: Optional[datetime] = None,
                    end_date: Optional[datetime] = None) -> Dict:
        """運行回測"""
        
        if self.market_data is None:
            raise ValueError("Market data not loaded")
        
        # 篩選日期範圍
        data = self.market_data.copy()
        if start_date:
            data = data[data['timestamp'] >= start_date]
        if end_date:
            data = data[data['timestamp'] <= end_date]
        
        if len(data) == 0:
            raise ValueError("No data in specified date range")
        
        logger.info(f"Starting backtest from {data['timestamp'].min()} to {data['timestamp'].max()}")
        logger.info(f"Initial capital: ${self.portfolio.initial_capital:,.2f}")
        
        # 初始化
        self.trades.clear()
        self.portfolio_history.clear()
        self.orders.clear()
        
        # 逐日回測
        for idx, row in data.iterrows():
            timestamp = row['timestamp']
            
            # 更新當前價格
            for col in data.columns:
                if col.endswith('_close') or col == 'close':
                    symbol = col.replace('_close', '') if col != 'close' else 'default'
                    self.current_prices[symbol] = row[col]
            
            # 如果只有一個價格欄位，使用預設符號
            if 'close' in row and len(self.current_prices) == 0:
                self.current_prices['default'] = row['close']
            
            # 生成交易信號
            try:
                signals = strategy.generate_signals(data.loc[:idx], timestamp)
                
                # 執行訂單
                for order in signals:
                    if self.execute_order(order, timestamp):
                        self.orders.append(order)
                        
            except Exception as e:
                logger.error(f"Error generating signals at {timestamp}: {str(e)}")
                continue
            
            # 更新投資組合
            portfolio_metrics = self.portfolio.update_portfolio(self.current_prices)
            risk_metrics = self.risk_manager.update_risk_metrics(self.portfolio)
            
            # 記錄歷史
            history_record = {
                'timestamp': timestamp,
                **portfolio_metrics,
                **risk_metrics,
                'returns': 0.0  # 將在後處理中計算
            }
            
            self.portfolio_history.append(history_record)
        
        # 計算收益率
        self._calculate_returns()
        
        # 生成回測報告
        results = self._generate_backtest_results()
        
        logger.info(f"Backtest completed. Total trades: {len(self.trades)}")
        logger.info(f"Final portfolio value: ${self.portfolio.total_value:,.2f}")
        
        return results
    
    def _calculate_returns(self):
        """計算收益率"""
        if len(self.portfolio_history) < 2:
            return
        
        for i in range(len(self.portfolio_history)):
            if i == 0:
                self.portfolio_history[i]['returns'] = 0.0
            else:
                prev_value = self.portfolio_history[i-1]['total_value']
                curr_value = self.portfolio_history[i]['total_value']
                self.portfolio_history[i]['returns'] = (curr_value - prev_value) / prev_value
    
    def _generate_backtest_results(self) -> Dict:
        """生成回測結果"""
        if not self.portfolio_history:
            return {}
        
        # 轉換為DataFrame便於分析
        history_df = pd.DataFrame(self.portfolio_history)
        trades_df = pd.DataFrame(self.trades) if self.trades else pd.DataFrame()
        
        # 基本統計
        total_return = (self.portfolio.total_value - self.portfolio.initial_capital) / self.portfolio.initial_capital
        total_trades = len(self.trades)
        
        # 勝率計算
        if total_trades > 0:
            profitable_trades = len([t for t in self.trades if 
                                   (t['side'] == 'buy' and t['price'] > 0) or 
                                   (t['side'] == 'sell' and t['price'] > 0)])
            win_rate = profitable_trades / total_trades if total_trades > 0 else 0
        else:
            win_rate = 0
        
        # 計算最大回撤
        peak_values = history_df['total_value'].expanding().max()
        drawdowns = (history_df['total_value'] - peak_values) / peak_values
        max_drawdown = drawdowns.min()
        
        results = {
            'initial_capital': self.portfolio.initial_capital,
            'final_value': self.portfolio.total_value,
            'total_return': total_return,
            'total_trades': total_trades,
            'win_rate': win_rate,
            'max_drawdown': abs(max_drawdown),
            'portfolio_history': history_df,
            'trades': trades_df,
            'orders': self.orders
        }
        
        return results
    
    def get_portfolio_summary(self) -> Dict:
        """獲取投資組合摘要"""
        summary = {
            'total_value': self.portfolio.total_value,
            'cash': self.portfolio.cash,
            'positions': {},
            'margin_used': self.portfolio.margin_used,
            'margin_available': self.portfolio.margin_available
        }
        
        for symbol, position in self.portfolio.positions.items():
            if position.quantity != 0:
                summary['positions'][symbol] = {
                    'quantity': position.quantity,
                    'avg_price': position.avg_price,
                    'market_value': position.market_value,
                    'unrealized_pnl': position.unrealized_pnl,
                    'realized_pnl': position.realized_pnl
                }
        
        return summary

# 範例策略實作
class SimpleMovingAverageStrategy(Strategy):
    """簡單移動平均策略範例"""
    
    def __init__(self, short_window: int = 10, long_window: int = 30,
                 position_size: float = 1000):
        self.short_window = short_window
        self.long_window = long_window
        self.position_size = position_size
        self.position = 0  # 當前持倉狀態
    
    def generate_signals(self, data: pd.DataFrame, timestamp: datetime) -> List[Order]:
        """生成交易信號"""
        orders = []
        
        if len(data) < self.long_window:
            return orders
        
        # 計算移動平均
        prices = data['close'] if 'close' in data.columns else data.iloc[:, -1]
        short_ma = prices.rolling(window=self.short_window).mean().iloc[-1]
        long_ma = prices.rolling(window=self.long_window).mean().iloc[-1]
        
        # 生成交易信號
        if short_ma > long_ma and self.position <= 0:
            # 買入信號
            if self.position < 0:
                # 先平空倉
                orders.append(Order(
                    symbol='default',
                    side=OrderSide.BUY,
                    order_type=OrderType.MARKET,
                    quantity=abs(self.position)
                ))
            
            # 開多倉
            orders.append(Order(
                symbol='default',
                side=OrderSide.BUY,
                order_type=OrderType.MARKET,
                quantity=self.position_size
            ))
            self.position = self.position_size
            
        elif short_ma < long_ma and self.position >= 0:
            # 賣出信號
            if self.position > 0:
                # 先平多倉
                orders.append(Order(
                    symbol='default',
                    side=OrderSide.SELL,
                    order_type=OrderType.MARKET,
                    quantity=self.position
                ))
            
            # 開空倉
            orders.append(Order(
                symbol='default',
                side=OrderSide.SELL,
                order_type=OrderType.MARKET,
                quantity=self.position_size
            ))
            self.position = -self.position_size
        
        return orders
    
    def get_required_data(self) -> List[str]:
        """獲取所需數據欄位"""
        return ['close', 'volume']

if __name__ == "__main__":
    # 範例使用
    import matplotlib.pyplot as plt
    
    # 生成模擬數據
    np.random.seed(42)
    dates = pd.date_range('2023-01-01', periods=252, freq='D')
    prices = 100 * (1 + np.cumsum(np.random.normal(0.001, 0.02, 252)))
    volumes = np.random.lognormal(10, 1, 252)
    
    market_data = pd.DataFrame({
        'timestamp': dates,
        'close': prices,
        'volume': volumes
    })
    
    # 創建回測引擎
    engine = BacktestEngine(
        initial_capital=100000,
        commission_rate=0.001,
        slippage_rate=0.0005
    )
    
    # 載入數據
    engine.load_data(market_data)
    
    # 創建策略
    strategy = SimpleMovingAverageStrategy(short_window=10, long_window=30)
    
    # 運行回測
    results = engine.run_backtest(strategy)
    
    # 顯示結果
    print("=== 回測結果 ===")
    print(f"初始資金: ${results['initial_capital']:,.2f}")
    print(f"最終價值: ${results['final_value']:,.2f}")
    print(f"總收益率: {results['total_return']:.2%}")
    print(f"最大回撤: {results['max_drawdown']:.2%}")
    print(f"總交易次數: {results['total_trades']}")
    print(f"勝率: {results['win_rate']:.2%}")
    
    # 繪製績效圖表
    if not results['portfolio_history'].empty:
        plt.figure(figsize=(12, 8))
        
        plt.subplot(2, 1, 1)
        plt.plot(results['portfolio_history']['timestamp'], 
                results['portfolio_history']['total_value'])
        plt.title('Portfolio Value Over Time')
        plt.ylabel('Value ($)')
        
        plt.subplot(2, 1, 2)
        cumulative_returns = (results['portfolio_history']['total_value'] / 
                            results['initial_capital'] - 1) * 100
        plt.plot(results['portfolio_history']['timestamp'], cumulative_returns)
        plt.title('Cumulative Returns (%)')
        plt.ylabel('Returns (%)')
        plt.xlabel('Date')
        
        plt.tight_layout()
        plt.savefig('backtest_results.png', dpi=300, bbox_inches='tight')
        print("績效圖表已保存為 backtest_results.png")