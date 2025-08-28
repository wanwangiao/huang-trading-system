"""
核心風險管理系統
Risk Manager - Core Risk Management System

提供實時風險監控、倉位管理、止損機制、相關性監控和壓力測試功能
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Any, Union
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
from scipy import stats
from scipy.stats import norm
from sklearn.covariance import EmpiricalCovariance
import warnings
warnings.filterwarnings('ignore')


@dataclass
class RiskMetrics:
    """風險指標數據結構"""
    var_95: float  # 95% VaR
    var_99: float  # 99% VaR
    cvar_95: float  # 95% CVaR (Expected Shortfall)
    cvar_99: float  # 99% CVaR
    max_drawdown: float  # 最大回撤
    current_drawdown: float  # 當前回撤
    volatility: float  # 年化波動率
    sharpe_ratio: float  # 夏普比率
    sortino_ratio: float  # 索提諾比率
    calmar_ratio: float  # 卡瑪比率
    beta: float  # 市場貝塔值
    tracking_error: float  # 追蹤誤差
    information_ratio: float  # 信息比率
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class PositionLimits:
    """倉位限制配置"""
    max_position_size: float = 0.1  # 單一標的最大倉位比例
    max_sector_exposure: float = 0.3  # 單一行業最大暴露
    max_country_exposure: float = 0.5  # 單一國家最大暴露
    max_leverage: float = 2.0  # 最大槓桿倍數
    max_correlation_threshold: float = 0.8  # 最大相關性閾值
    max_concentration_risk: float = 0.2  # 最大集中度風險


@dataclass
class StopLossConfig:
    """止損配置"""
    fixed_stop_loss: float = 0.05  # 固定止損比例
    trailing_stop_loss: float = 0.03  # 追蹤止損比例
    time_stop_loss_hours: int = 24  # 時間止損（小時）
    max_holding_days: int = 30  # 最大持倉天數
    volatility_multiplier: float = 2.0  # 波動率倍數止損


class RiskManager:
    """
    核心風險管理系統
    
    功能包括：
    - 實時風險監控：VaR, CVaR, 最大回撤
    - 倉位管理：動態倉位調整、風險預算
    - 止損機制：固定止損、追蹤止損、時間止損
    - 相關性監控：避免過度集中風險
    - 壓力測試：極端市場情境模擬
    """
    
    def __init__(self, config: Dict[str, Any]):
        """
        初始化風險管理器
        
        Args:
            config: 風險管理配置字典
        """
        self.config = config
        self.position_limits = PositionLimits(**config.get('position_limits', {}))
        self.stop_loss_config = StopLossConfig(**config.get('stop_loss_config', {}))
        
        # 風險監控參數
        self.lookback_window = config.get('lookback_window', 252)  # 回看窗口（交易日）
        self.confidence_levels = config.get('confidence_levels', [0.95, 0.99])
        self.rebalance_frequency = config.get('rebalance_frequency', 'daily')
        
        # 歷史數據存儲
        self.price_history: Dict[str, pd.Series] = {}
        self.return_history: Dict[str, pd.Series] = {}
        self.position_history: Dict[str, pd.Series] = {}
        self.pnl_history: pd.Series = pd.Series(dtype=float)
        
        # 當前倉位和狀態
        self.current_positions: Dict[str, float] = {}
        self.stop_loss_levels: Dict[str, Dict[str, float]] = {}
        self.position_entry_time: Dict[str, datetime] = {}
        
        # 風險指標歷史
        self.risk_metrics_history: List[RiskMetrics] = []
        
        # 設置日誌
        self.logger = self._setup_logger()
        
        self.logger.info("風險管理器初始化完成")
    
    def _setup_logger(self) -> logging.Logger:
        """設置日誌系統"""
        logger = logging.getLogger('RiskManager')
        logger.setLevel(logging.INFO)
        
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
        
        return logger
    
    def update_market_data(self, 
                          prices: Dict[str, float],
                          timestamp: Optional[datetime] = None) -> None:
        """
        更新市場數據
        
        Args:
            prices: 標的價格字典 {symbol: price}
            timestamp: 時間戳，默認為當前時間
        """
        if timestamp is None:
            timestamp = datetime.now()
        
        # 更新價格歷史
        for symbol, price in prices.items():
            if symbol not in self.price_history:
                self.price_history[symbol] = pd.Series(dtype=float)
            
            self.price_history[symbol].loc[timestamp] = price
            
            # 保持固定長度的歷史數據
            if len(self.price_history[symbol]) > self.lookback_window:
                self.price_history[symbol] = self.price_history[symbol].tail(self.lookback_window)
    
    def update_positions(self, positions: Dict[str, float]) -> None:
        """
        更新當前倉位
        
        Args:
            positions: 倉位字典 {symbol: weight}
        """
        timestamp = datetime.now()
        
        # 記錄新開倉的時間
        for symbol, weight in positions.items():
            if symbol not in self.current_positions or self.current_positions[symbol] == 0:
                if weight != 0:
                    self.position_entry_time[symbol] = timestamp
        
        # 更新當前倉位
        self.current_positions = positions.copy()
        
        # 更新倉位歷史
        for symbol, weight in positions.items():
            if symbol not in self.position_history:
                self.position_history[symbol] = pd.Series(dtype=float)
            
            self.position_history[symbol].loc[timestamp] = weight
        
        # 計算投資組合收益
        self._calculate_portfolio_pnl(timestamp)
        
        self.logger.info(f"倉位更新完成，總倉位數：{len([w for w in positions.values() if w != 0])}")
    
    def _calculate_portfolio_pnl(self, timestamp: datetime) -> None:
        """計算投資組合損益"""
        if not self.current_positions or len(self.price_history) == 0:
            return
        
        total_pnl = 0.0
        
        for symbol, weight in self.current_positions.items():
            if weight == 0 or symbol not in self.price_history:
                continue
            
            if len(self.price_history[symbol]) < 2:
                continue
            
            # 計算單期收益率
            price_series = self.price_history[symbol]
            if len(price_series) >= 2:
                returns = price_series.pct_change().dropna()
                if len(returns) > 0:
                    if symbol not in self.return_history:
                        self.return_history[symbol] = pd.Series(dtype=float)
                    
                    latest_return = returns.iloc[-1]
                    self.return_history[symbol].loc[timestamp] = latest_return
                    total_pnl += weight * latest_return
        
        # 更新組合損益歷史
        self.pnl_history.loc[timestamp] = total_pnl
        
        # 保持固定長度
        if len(self.pnl_history) > self.lookback_window:
            self.pnl_history = self.pnl_history.tail(self.lookback_window)
    
    def calculate_var(self, 
                     confidence_level: float = 0.95,
                     method: str = 'historical') -> float:
        """
        計算風險價值 (Value at Risk)
        
        Args:
            confidence_level: 信心水準
            method: 計算方法 ('historical', 'parametric', 'monte_carlo')
            
        Returns:
            VaR值
        """
        if len(self.pnl_history) < 30:
            return 0.0
        
        returns = self.pnl_history.dropna()
        
        if method == 'historical':
            # 歷史模擬法
            var = np.percentile(returns, (1 - confidence_level) * 100)
        
        elif method == 'parametric':
            # 參數法（假設正態分布）
            mean_return = returns.mean()
            std_return = returns.std()
            z_score = norm.ppf(1 - confidence_level)
            var = mean_return + z_score * std_return
        
        elif method == 'monte_carlo':
            # 蒙地卡羅模擬
            mean_return = returns.mean()
            std_return = returns.std()
            simulated_returns = np.random.normal(mean_return, std_return, 10000)
            var = np.percentile(simulated_returns, (1 - confidence_level) * 100)
        
        else:
            raise ValueError(f"未支持的VaR計算方法: {method}")
        
        return float(var)
    
    def calculate_cvar(self, confidence_level: float = 0.95) -> float:
        """
        計算條件風險價值 (Conditional VaR / Expected Shortfall)
        
        Args:
            confidence_level: 信心水準
            
        Returns:
            CVaR值
        """
        if len(self.pnl_history) < 30:
            return 0.0
        
        returns = self.pnl_history.dropna()
        var = self.calculate_var(confidence_level, 'historical')
        
        # CVaR = 超過VaR的損失的期望值
        tail_losses = returns[returns <= var]
        cvar = tail_losses.mean() if len(tail_losses) > 0 else var
        
        return float(cvar)
    
    def calculate_drawdown(self) -> Tuple[float, float]:
        """
        計算回撤指標
        
        Returns:
            (最大回撤, 當前回撤)
        """
        if len(self.pnl_history) < 2:
            return 0.0, 0.0
        
        # 計算累積收益率曲線
        cumulative_returns = (1 + self.pnl_history).cumprod()
        
        # 計算回撤
        running_max = cumulative_returns.expanding().max()
        drawdown = (cumulative_returns - running_max) / running_max
        
        max_drawdown = abs(drawdown.min())
        current_drawdown = abs(drawdown.iloc[-1])
        
        return float(max_drawdown), float(current_drawdown)
    
    def calculate_volatility(self, annualized: bool = True) -> float:
        """
        計算波動率
        
        Args:
            annualized: 是否年化
            
        Returns:
            波動率
        """
        if len(self.pnl_history) < 30:
            return 0.0
        
        returns = self.pnl_history.dropna()
        volatility = returns.std()
        
        if annualized:
            # 假設252個交易日
            volatility *= np.sqrt(252)
        
        return float(volatility)
    
    def calculate_risk_metrics(self) -> RiskMetrics:
        """計算完整的風險指標"""
        if len(self.pnl_history) < 30:
            return RiskMetrics(
                var_95=0.0, var_99=0.0, cvar_95=0.0, cvar_99=0.0,
                max_drawdown=0.0, current_drawdown=0.0, volatility=0.0,
                sharpe_ratio=0.0, sortino_ratio=0.0, calmar_ratio=0.0,
                beta=0.0, tracking_error=0.0, information_ratio=0.0
            )
        
        returns = self.pnl_history.dropna()
        
        # 基礎風險指標
        var_95 = self.calculate_var(0.95)
        var_99 = self.calculate_var(0.99)
        cvar_95 = self.calculate_cvar(0.95)
        cvar_99 = self.calculate_cvar(0.99)
        max_dd, current_dd = self.calculate_drawdown()
        volatility = self.calculate_volatility()
        
        # 風險調整績效指標
        mean_return = returns.mean() * 252  # 年化
        sharpe_ratio = mean_return / volatility if volatility > 0 else 0.0
        
        # 索提諾比率（下行偏差）
        downside_returns = returns[returns < 0]
        downside_volatility = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 0 else volatility
        sortino_ratio = mean_return / downside_volatility if downside_volatility > 0 else 0.0
        
        # 卡瑪比率
        calmar_ratio = mean_return / max_dd if max_dd > 0 else 0.0
        
        # 市場相關指標（假設有基準指數）
        beta = 1.0  # 簡化假設
        tracking_error = volatility  # 簡化
        information_ratio = sharpe_ratio  # 簡化
        
        metrics = RiskMetrics(
            var_95=var_95, var_99=var_99,
            cvar_95=cvar_95, cvar_99=cvar_99,
            max_drawdown=max_dd, current_drawdown=current_dd,
            volatility=volatility,
            sharpe_ratio=sharpe_ratio,
            sortino_ratio=sortino_ratio,
            calmar_ratio=calmar_ratio,
            beta=beta,
            tracking_error=tracking_error,
            information_ratio=information_ratio
        )
        
        # 保存到歷史記錄
        self.risk_metrics_history.append(metrics)
        if len(self.risk_metrics_history) > self.lookback_window:
            self.risk_metrics_history = self.risk_metrics_history[-self.lookback_window:]
        
        return metrics
    
    def check_position_limits(self) -> Dict[str, List[str]]:
        """
        檢查倉位限制
        
        Returns:
            違規信息字典
        """
        violations = {
            'position_size': [],
            'leverage': [],
            'concentration': []
        }
        
        if not self.current_positions:
            return violations
        
        # 檢查單一標的倉位限制
        for symbol, weight in self.current_positions.items():
            if abs(weight) > self.position_limits.max_position_size:
                violations['position_size'].append(
                    f"{symbol}: {abs(weight):.3f} > {self.position_limits.max_position_size:.3f}"
                )
        
        # 檢查總槓桿
        total_leverage = sum(abs(w) for w in self.current_positions.values())
        if total_leverage > self.position_limits.max_leverage:
            violations['leverage'].append(
                f"總槓桿: {total_leverage:.3f} > {self.position_limits.max_leverage:.3f}"
            )
        
        # 檢查集中度風險
        weights = np.array(list(self.current_positions.values()))
        if len(weights) > 0:
            concentration = np.sum(weights**2)  # Herfindahl指數
            if concentration > self.position_limits.max_concentration_risk:
                violations['concentration'].append(
                    f"集中度風險: {concentration:.3f} > {self.position_limits.max_concentration_risk:.3f}"
                )
        
        return violations
    
    def calculate_correlation_matrix(self) -> pd.DataFrame:
        """計算資產相關性矩陣"""
        if len(self.return_history) < 2:
            return pd.DataFrame()
        
        # 獲取所有資產的收益率數據
        return_data = {}
        for symbol, returns in self.return_history.items():
            if len(returns) >= 30:  # 至少需要30個觀測值
                return_data[symbol] = returns
        
        if len(return_data) < 2:
            return pd.DataFrame()
        
        # 創建收益率矩陣
        return_df = pd.DataFrame(return_data)
        return_df = return_df.dropna()
        
        if len(return_df) < 30:
            return pd.DataFrame()
        
        # 計算相關性矩陣
        correlation_matrix = return_df.corr()
        
        return correlation_matrix
    
    def check_correlation_risk(self) -> List[Tuple[str, str, float]]:
        """
        檢查相關性風險
        
        Returns:
            高相關性資產對列表 [(asset1, asset2, correlation)]
        """
        corr_matrix = self.calculate_correlation_matrix()
        
        if corr_matrix.empty:
            return []
        
        high_correlations = []
        symbols = corr_matrix.columns.tolist()
        
        for i in range(len(symbols)):
            for j in range(i + 1, len(symbols)):
                correlation = corr_matrix.iloc[i, j]
                
                if abs(correlation) > self.position_limits.max_correlation_threshold:
                    # 檢查這兩個資產是否都有倉位
                    symbol1, symbol2 = symbols[i], symbols[j]
                    if (self.current_positions.get(symbol1, 0) != 0 and 
                        self.current_positions.get(symbol2, 0) != 0):
                        
                        high_correlations.append((symbol1, symbol2, correlation))
        
        return high_correlations
    
    def update_stop_loss_levels(self) -> None:
        """更新止損水準"""
        current_time = datetime.now()
        
        for symbol, weight in self.current_positions.items():
            if weight == 0 or symbol not in self.price_history:
                continue
            
            if len(self.price_history[symbol]) == 0:
                continue
            
            current_price = self.price_history[symbol].iloc[-1]
            
            if symbol not in self.stop_loss_levels:
                self.stop_loss_levels[symbol] = {}
            
            # 固定止損
            if weight > 0:  # 多頭倉位
                fixed_stop = current_price * (1 - self.stop_loss_config.fixed_stop_loss)
            else:  # 空頭倉位
                fixed_stop = current_price * (1 + self.stop_loss_config.fixed_stop_loss)
            
            self.stop_loss_levels[symbol]['fixed_stop'] = fixed_stop
            
            # 追蹤止損
            if 'trailing_stop' not in self.stop_loss_levels[symbol]:
                self.stop_loss_levels[symbol]['trailing_stop'] = fixed_stop
            else:
                trailing_stop = self.stop_loss_levels[symbol]['trailing_stop']
                if weight > 0:  # 多頭倉位
                    new_trailing = current_price * (1 - self.stop_loss_config.trailing_stop_loss)
                    self.stop_loss_levels[symbol]['trailing_stop'] = max(trailing_stop, new_trailing)
                else:  # 空頭倉位
                    new_trailing = current_price * (1 + self.stop_loss_config.trailing_stop_loss)
                    self.stop_loss_levels[symbol]['trailing_stop'] = min(trailing_stop, new_trailing)
            
            # 波動率調整止損
            if len(self.return_history.get(symbol, pd.Series())) >= 30:
                returns = self.return_history[symbol]
                volatility = returns.std()
                vol_stop_distance = volatility * self.stop_loss_config.volatility_multiplier
                
                if weight > 0:
                    vol_stop = current_price * (1 - vol_stop_distance)
                else:
                    vol_stop = current_price * (1 + vol_stop_distance)
                
                self.stop_loss_levels[symbol]['volatility_stop'] = vol_stop
    
    def check_stop_loss_triggers(self) -> Dict[str, List[str]]:
        """
        檢查止損觸發
        
        Returns:
            止損觸發信息
        """
        triggers = {}
        current_time = datetime.now()
        
        for symbol, weight in self.current_positions.items():
            if weight == 0 or symbol not in self.price_history:
                continue
            
            if len(self.price_history[symbol]) == 0:
                continue
            
            current_price = self.price_history[symbol].iloc[-1]
            symbol_triggers = []
            
            # 檢查價格止損
            if symbol in self.stop_loss_levels:
                stops = self.stop_loss_levels[symbol]
                
                if weight > 0:  # 多頭倉位
                    if current_price <= stops.get('fixed_stop', 0):
                        symbol_triggers.append('固定止損觸發')
                    if current_price <= stops.get('trailing_stop', 0):
                        symbol_triggers.append('追蹤止損觸發')
                    if current_price <= stops.get('volatility_stop', 0):
                        symbol_triggers.append('波動率止損觸發')
                else:  # 空頭倉位
                    if current_price >= stops.get('fixed_stop', float('inf')):
                        symbol_triggers.append('固定止損觸發')
                    if current_price >= stops.get('trailing_stop', float('inf')):
                        symbol_triggers.append('追蹤止損觸發')
                    if current_price >= stops.get('volatility_stop', float('inf')):
                        symbol_triggers.append('波動率止損觸發')
            
            # 檢查時間止損
            if symbol in self.position_entry_time:
                entry_time = self.position_entry_time[symbol]
                holding_hours = (current_time - entry_time).total_seconds() / 3600
                
                if holding_hours > self.stop_loss_config.time_stop_loss_hours:
                    symbol_triggers.append('時間止損觸發')
                
                holding_days = (current_time - entry_time).days
                if holding_days > self.stop_loss_config.max_holding_days:
                    symbol_triggers.append('最大持倉期限觸發')
            
            if symbol_triggers:
                triggers[symbol] = symbol_triggers
        
        return triggers
    
    def stress_test(self, scenarios: Dict[str, Dict[str, float]]) -> Dict[str, RiskMetrics]:
        """
        壓力測試
        
        Args:
            scenarios: 壓力情境 {'scenario_name': {'symbol': shock_ratio}}
            
        Returns:
            各情境下的風險指標
        """
        results = {}
        
        if not self.current_positions or len(self.price_history) == 0:
            return results
        
        for scenario_name, shocks in scenarios.items():
            # 模擬價格衝擊
            stressed_returns = []
            
            for symbol, weight in self.current_positions.items():
                if weight == 0:
                    continue
                
                shock = shocks.get(symbol, 0.0)
                stressed_return = weight * shock
                stressed_returns.append(stressed_return)
            
            if not stressed_returns:
                continue
            
            # 計算組合總衝擊
            portfolio_shock = sum(stressed_returns)
            
            # 創建臨時的損益序列
            temp_pnl = self.pnl_history.copy()
            temp_pnl.loc[datetime.now()] = portfolio_shock
            
            # 暫時替換損益歷史進行計算
            original_pnl = self.pnl_history
            self.pnl_history = temp_pnl
            
            # 計算壓力情境下的風險指標
            stressed_metrics = self.calculate_risk_metrics()
            results[scenario_name] = stressed_metrics
            
            # 恢復原始數據
            self.pnl_history = original_pnl
        
        return results
    
    def get_risk_budget(self) -> Dict[str, float]:
        """
        計算風險預算分配
        
        Returns:
            各資產的風險貢獻度
        """
        if not self.current_positions:
            return {}
        
        # 計算投資組合波動率
        portfolio_vol = self.calculate_volatility(annualized=False)
        
        if portfolio_vol == 0:
            return {}
        
        risk_contributions = {}
        
        # 簡化的風險貢獻計算
        for symbol, weight in self.current_positions.items():
            if weight == 0:
                continue
            
            # 假設各資產的風險貢獻與權重成正比（簡化計算）
            asset_vol = 0.0
            if symbol in self.return_history and len(self.return_history[symbol]) >= 30:
                asset_vol = self.return_history[symbol].std()
            
            risk_contribution = abs(weight) * asset_vol / portfolio_vol if portfolio_vol > 0 else 0
            risk_contributions[symbol] = risk_contribution
        
        return risk_contributions
    
    def generate_risk_report(self) -> Dict[str, Any]:
        """生成風險報告"""
        # 計算當前風險指標
        current_metrics = self.calculate_risk_metrics()
        
        # 檢查限制違規
        limit_violations = self.check_position_limits()
        correlation_risks = self.check_correlation_risk()
        stop_loss_triggers = self.check_stop_loss_triggers()
        
        # 風險預算
        risk_budget = self.get_risk_budget()
        
        # 壓力測試情境
        stress_scenarios = {
            '市場下跌10%': {symbol: -0.10 for symbol in self.current_positions.keys()},
            '波動率衝擊': {symbol: -0.05 for symbol in self.current_positions.keys()},
            '流動性危機': {symbol: -0.15 for symbol in self.current_positions.keys()}
        }
        stress_results = self.stress_test(stress_scenarios)
        
        report = {
            'timestamp': datetime.now(),
            'risk_metrics': current_metrics,
            'limit_violations': limit_violations,
            'correlation_risks': correlation_risks,
            'stop_loss_triggers': stop_loss_triggers,
            'risk_budget': risk_budget,
            'stress_test_results': stress_results,
            'current_positions': self.current_positions.copy(),
            'portfolio_summary': {
                'total_positions': len([w for w in self.current_positions.values() if w != 0]),
                'total_leverage': sum(abs(w) for w in self.current_positions.values()),
                'portfolio_value': 1.0  # 假設標準化為1
            }
        }
        
        return report
    
    def log_risk_event(self, event_type: str, message: str, severity: str = 'INFO'):
        """記錄風險事件"""
        severity_map = {
            'INFO': self.logger.info,
            'WARNING': self.logger.warning,
            'ERROR': self.logger.error,
            'CRITICAL': self.logger.critical
        }
        
        log_func = severity_map.get(severity, self.logger.info)
        log_func(f"[{event_type}] {message}")


# 示例使用
if __name__ == "__main__":
    # 配置風險管理器
    config = {
        'lookback_window': 252,
        'confidence_levels': [0.95, 0.99],
        'rebalance_frequency': 'daily',
        'position_limits': {
            'max_position_size': 0.1,
            'max_sector_exposure': 0.3,
            'max_leverage': 2.0,
            'max_correlation_threshold': 0.8
        },
        'stop_loss_config': {
            'fixed_stop_loss': 0.05,
            'trailing_stop_loss': 0.03,
            'time_stop_loss_hours': 24,
            'volatility_multiplier': 2.0
        }
    }
    
    # 創建風險管理器
    risk_manager = RiskManager(config)
    
    # 模擬市場數據更新
    import random
    
    symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA']
    base_prices = {symbol: 100 + random.randint(-50, 50) for symbol in symbols}
    
    # 模擬30天的數據
    for day in range(30):
        # 更新價格（隨機遊走）
        for symbol in symbols:
            change = random.gauss(0, 0.02)  # 2%日波動率
            base_prices[symbol] *= (1 + change)
        
        timestamp = datetime.now() - timedelta(days=29-day)
        risk_manager.update_market_data(base_prices, timestamp)
        
        # 更新倉位（每5天調整）
        if day % 5 == 0:
            positions = {symbol: random.uniform(-0.2, 0.2) for symbol in symbols}
            risk_manager.update_positions(positions)
            risk_manager.update_stop_loss_levels()
    
    # 生成風險報告
    report = risk_manager.generate_risk_report()
    
    print("=== 風險管理報告 ===")
    print(f"報告時間: {report['timestamp']}")
    print(f"\n風險指標:")
    metrics = report['risk_metrics']
    print(f"VaR(95%): {metrics.var_95:.4f}")
    print(f"CVaR(95%): {metrics.cvar_95:.4f}")
    print(f"最大回撤: {metrics.max_drawdown:.4f}")
    print(f"夏普比率: {metrics.sharpe_ratio:.4f}")
    
    print(f"\n組合摘要:")
    summary = report['portfolio_summary']
    print(f"持倉數量: {summary['total_positions']}")
    print(f"總槓桿: {summary['total_leverage']:.2f}")
    
    if report['limit_violations']['position_size']:
        print(f"\n倉位限制違規: {report['limit_violations']['position_size']}")
    
    if report['correlation_risks']:
        print(f"\n高相關性風險: {report['correlation_risks']}")
    
    if report['stop_loss_triggers']:
        print(f"\n止損觸發: {report['stop_loss_triggers']}")
    
    print("\n風險管理系統運行完成!")