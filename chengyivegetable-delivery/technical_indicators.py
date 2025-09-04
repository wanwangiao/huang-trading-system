"""
技術指標計算引擎
專業的技術指標計算庫，支援高效向量化計算和即時更新
"""

import numpy as np
import pandas as pd
from typing import Tuple, Optional, Union
import warnings
from numba import jit


class TechnicalIndicators:
    """
    技術指標計算引擎
    提供完整的技術指標計算功能，包括趨勢、振盪、成交量、波動率和動量指標
    """

    @staticmethod
    def validate_data(data: Union[pd.Series, pd.DataFrame, np.ndarray]) -> np.ndarray:
        """驗證和預處理輸入數據"""
        if isinstance(data, (pd.Series, pd.DataFrame)):
            data = data.values
        if isinstance(data, list):
            data = np.array(data)
        
        if len(data) == 0:
            raise ValueError("輸入數據不能為空")
        
        # 移除 NaN 值
        if np.isnan(data).any():
            warnings.warn("數據中包含 NaN 值，已自動移除")
            data = data[~np.isnan(data)]
        
        return data.astype(np.float64)

    # ========== 趨勢指標 ==========
    
    @classmethod
    def simple_moving_average(cls, data: Union[pd.Series, np.ndarray], period: int) -> np.ndarray:
        """
        簡單移動平均線 (SMA)
        
        Args:
            data: 價格數據
            period: 計算週期
            
        Returns:
            SMA 值陣列
        """
        data = cls.validate_data(data)
        if len(data) < period:
            raise ValueError(f"數據長度 {len(data)} 小於週期 {period}")
        
        return pd.Series(data).rolling(window=period, min_periods=period).mean().values

    @classmethod
    def exponential_moving_average(cls, data: Union[pd.Series, np.ndarray], period: int, alpha: Optional[float] = None) -> np.ndarray:
        """
        指數移動平均線 (EMA)
        
        Args:
            data: 價格數據
            period: 計算週期
            alpha: 平滑係數，默認為 2/(period+1)
            
        Returns:
            EMA 值陣列
        """
        data = cls.validate_data(data)
        if alpha is None:
            alpha = 2.0 / (period + 1)
        
        ema = np.full(len(data), np.nan)
        ema[0] = data[0]
        
        for i in range(1, len(data)):
            ema[i] = alpha * data[i] + (1 - alpha) * ema[i-1]
        
        return ema

    @classmethod
    def macd(cls, data: Union[pd.Series, np.ndarray], fast_period: int = 12, 
             slow_period: int = 26, signal_period: int = 9) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        MACD 指標
        
        Args:
            data: 價格數據
            fast_period: 快線週期
            slow_period: 慢線週期
            signal_period: 訊號線週期
            
        Returns:
            (MACD線, 訊號線, 直方圖)
        """
        data = cls.validate_data(data)
        
        ema_fast = cls.exponential_moving_average(data, fast_period)
        ema_slow = cls.exponential_moving_average(data, slow_period)
        
        macd_line = ema_fast - ema_slow
        signal_line = cls.exponential_moving_average(macd_line, signal_period)
        histogram = macd_line - signal_line
        
        return macd_line, signal_line, histogram

    @classmethod 
    def adx(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        平均趨向指標 (ADX)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            period: 計算週期
            
        Returns:
            (ADX, +DI, -DI)
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        
        # 計算真實波幅和方向移動
        tr = cls.true_range(high, low, close)
        dm_plus = np.where((high[1:] - high[:-1]) > (low[:-1] - low[1:]), 
                          np.maximum(high[1:] - high[:-1], 0), 0)
        dm_minus = np.where((low[:-1] - low[1:]) > (high[1:] - high[:-1]), 
                           np.maximum(low[:-1] - low[1:], 0), 0)
        
        # 平滑化
        tr_smooth = cls.exponential_moving_average(tr, period)[period-1:]
        dm_plus_smooth = cls.exponential_moving_average(np.concatenate([[0], dm_plus]), period)[period:]
        dm_minus_smooth = cls.exponential_moving_average(np.concatenate([[0], dm_minus]), period)[period:]
        
        # 計算方向指標
        di_plus = 100 * dm_plus_smooth / tr_smooth
        di_minus = 100 * dm_minus_smooth / tr_smooth
        
        # 計算 ADX
        dx = 100 * np.abs(di_plus - di_minus) / (di_plus + di_minus + 1e-10)
        adx = cls.exponential_moving_average(dx, period)
        
        return adx, di_plus, di_minus

    @classmethod
    def parabolic_sar(cls, high: np.ndarray, low: np.ndarray, acceleration: float = 0.02, 
                      max_acceleration: float = 0.2) -> np.ndarray:
        """
        拋物線轉向指標 (Parabolic SAR)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            acceleration: 加速因子
            max_acceleration: 最大加速因子
            
        Returns:
            SAR 值陣列
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        
        sar = np.full(len(high), np.nan)
        trend = np.full(len(high), 1)  # 1: 上漲, -1: 下跌
        af = np.full(len(high), acceleration)
        ep = np.full(len(high), np.nan)  # 極值點
        
        # 初始化
        sar[0] = low[0]
        ep[0] = high[0]
        
        for i in range(1, len(high)):
            if trend[i-1] == 1:  # 上漲趨勢
                sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
                
                # 檢查轉向
                if low[i] <= sar[i]:
                    trend[i] = -1
                    sar[i] = ep[i-1]
                    ep[i] = low[i]
                    af[i] = acceleration
                else:
                    trend[i] = 1
                    if high[i] > ep[i-1]:
                        ep[i] = high[i]
                        af[i] = min(af[i-1] + acceleration, max_acceleration)
                    else:
                        ep[i] = ep[i-1]
                        af[i] = af[i-1]
            else:  # 下跌趨勢
                sar[i] = sar[i-1] + af[i-1] * (ep[i-1] - sar[i-1])
                
                # 檢查轉向
                if high[i] >= sar[i]:
                    trend[i] = 1
                    sar[i] = ep[i-1]
                    ep[i] = high[i]
                    af[i] = acceleration
                else:
                    trend[i] = -1
                    if low[i] < ep[i-1]:
                        ep[i] = low[i]
                        af[i] = min(af[i-1] + acceleration, max_acceleration)
                    else:
                        ep[i] = ep[i-1]
                        af[i] = af[i-1]
        
        return sar

    # ========== 振盪指標 ==========
    
    @classmethod
    def rsi(cls, data: Union[pd.Series, np.ndarray], period: int = 14) -> np.ndarray:
        """
        相對強弱指標 (RSI)
        
        Args:
            data: 價格數據
            period: 計算週期
            
        Returns:
            RSI 值陣列
        """
        data = cls.validate_data(data)
        
        # 計算價格變化
        delta = np.diff(data)
        gain = np.where(delta > 0, delta, 0)
        loss = np.where(delta < 0, -delta, 0)
        
        # 計算平均漲幅和跌幅
        avg_gain = cls.exponential_moving_average(gain, period)
        avg_loss = cls.exponential_moving_average(loss, period)
        
        # 計算 RSI
        rs = avg_gain / (avg_loss + 1e-10)
        rsi = 100 - (100 / (1 + rs))
        
        # 添加第一個值為 NaN
        return np.concatenate([[np.nan], rsi])

    @classmethod
    def stochastic_oscillator(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, 
                             k_period: int = 14, d_period: int = 3) -> Tuple[np.ndarray, np.ndarray]:
        """
        隨機振盪器 (Stochastic Oscillator)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            k_period: %K 週期
            d_period: %D 週期 (平滑週期)
            
        Returns:
            (%K, %D)
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        
        # 計算最高價和最低價的滾動值
        highest_high = pd.Series(high).rolling(window=k_period, min_periods=k_period).max().values
        lowest_low = pd.Series(low).rolling(window=k_period, min_periods=k_period).min().values
        
        # 計算 %K
        k_percent = 100 * (close - lowest_low) / (highest_high - lowest_low + 1e-10)
        
        # 計算 %D (%K 的移動平均)
        d_percent = cls.simple_moving_average(k_percent, d_period)
        
        return k_percent, d_percent

    @classmethod
    def williams_r(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
        """
        威廉指標 (Williams %R)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            period: 計算週期
            
        Returns:
            Williams %R 值陣列
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        
        highest_high = pd.Series(high).rolling(window=period, min_periods=period).max().values
        lowest_low = pd.Series(low).rolling(window=period, min_periods=period).min().values
        
        williams_r = -100 * (highest_high - close) / (highest_high - lowest_low + 1e-10)
        
        return williams_r

    @classmethod
    def cci(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 20) -> np.ndarray:
        """
        順勢指標 (Commodity Channel Index)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            period: 計算週期
            
        Returns:
            CCI 值陣列
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        
        # 計算典型價格
        typical_price = (high + low + close) / 3
        
        # 計算移動平均
        sma_tp = cls.simple_moving_average(typical_price, period)
        
        # 計算平均偏差
        mad = pd.Series(typical_price).rolling(window=period, min_periods=period).apply(
            lambda x: np.mean(np.abs(x - x.mean()))
        ).values
        
        # 計算 CCI
        cci = (typical_price - sma_tp) / (0.015 * mad + 1e-10)
        
        return cci

    # ========== 成交量指標 ==========
    
    @classmethod
    def obv(cls, close: np.ndarray, volume: np.ndarray) -> np.ndarray:
        """
        能量潮指標 (On-Balance Volume)
        
        Args:
            close: 收盤價數據
            volume: 成交量數據
            
        Returns:
            OBV 值陣列
        """
        close = cls.validate_data(close)
        volume = cls.validate_data(volume)
        
        obv = np.full(len(close), np.nan)
        obv[0] = volume[0]
        
        for i in range(1, len(close)):
            if close[i] > close[i-1]:
                obv[i] = obv[i-1] + volume[i]
            elif close[i] < close[i-1]:
                obv[i] = obv[i-1] - volume[i]
            else:
                obv[i] = obv[i-1]
        
        return obv

    @classmethod
    def mfi(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, 
            volume: np.ndarray, period: int = 14) -> np.ndarray:
        """
        資金流量指標 (Money Flow Index)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            volume: 成交量數據
            period: 計算週期
            
        Returns:
            MFI 值陣列
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        volume = cls.validate_data(volume)
        
        # 計算典型價格和資金流量
        typical_price = (high + low + close) / 3
        money_flow = typical_price * volume
        
        # 計算正負資金流量
        positive_flow = np.where(typical_price[1:] > typical_price[:-1], money_flow[1:], 0)
        negative_flow = np.where(typical_price[1:] < typical_price[:-1], money_flow[1:], 0)
        
        # 計算資金流量比率
        positive_mf = pd.Series(np.concatenate([[0], positive_flow])).rolling(window=period, min_periods=period).sum().values
        negative_mf = pd.Series(np.concatenate([[0], negative_flow])).rolling(window=period, min_periods=period).sum().values
        
        # 計算 MFI
        money_ratio = positive_mf / (negative_mf + 1e-10)
        mfi = 100 - (100 / (1 + money_ratio))
        
        return mfi

    # ========== 波動率指標 ==========
    
    @classmethod
    def bollinger_bands(cls, data: Union[pd.Series, np.ndarray], period: int = 20, 
                       std_dev: float = 2) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        布林帶 (Bollinger Bands)
        
        Args:
            data: 價格數據
            period: 計算週期
            std_dev: 標準差倍數
            
        Returns:
            (上軌, 中軌, 下軌)
        """
        data = cls.validate_data(data)
        
        # 計算中軌 (移動平均)
        middle_band = cls.simple_moving_average(data, period)
        
        # 計算標準差
        rolling_std = pd.Series(data).rolling(window=period, min_periods=period).std().values
        
        # 計算上下軌
        upper_band = middle_band + (std_dev * rolling_std)
        lower_band = middle_band - (std_dev * rolling_std)
        
        return upper_band, middle_band, lower_band

    @classmethod
    def true_range(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray) -> np.ndarray:
        """
        真實波幅 (True Range)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            
        Returns:
            TR 值陣列
        """
        high = cls.validate_data(high)
        low = cls.validate_data(low)
        close = cls.validate_data(close)
        
        tr = np.maximum.reduce([
            high - low,
            np.abs(high - np.concatenate([[close[0]], close[:-1]])),
            np.abs(low - np.concatenate([[close[0]], close[:-1]]))
        ])
        
        return tr

    @classmethod
    def atr(cls, high: np.ndarray, low: np.ndarray, close: np.ndarray, period: int = 14) -> np.ndarray:
        """
        平均真實波幅 (Average True Range)
        
        Args:
            high: 最高價數據
            low: 最低價數據
            close: 收盤價數據
            period: 計算週期
            
        Returns:
            ATR 值陣列
        """
        tr = cls.true_range(high, low, close)
        atr = cls.exponential_moving_average(tr, period)
        
        return atr

    @classmethod
    def volatility(cls, data: Union[pd.Series, np.ndarray], period: int = 20, 
                   annualize: bool = True) -> np.ndarray:
        """
        歷史波動率
        
        Args:
            data: 價格數據
            period: 計算週期
            annualize: 是否年化
            
        Returns:
            波動率陣列
        """
        data = cls.validate_data(data)
        
        # 計算日收益率
        returns = np.diff(np.log(data))
        
        # 計算滾動標準差
        volatility = pd.Series(returns).rolling(window=period, min_periods=period).std().values
        
        if annualize:
            volatility *= np.sqrt(252)  # 假設一年有 252 個交易日
        
        # 添加第一個值為 NaN
        return np.concatenate([[np.nan], volatility])

    # ========== 動量指標 ==========
    
    @classmethod
    def roc(cls, data: Union[pd.Series, np.ndarray], period: int = 12) -> np.ndarray:
        """
        變動率指標 (Rate of Change)
        
        Args:
            data: 價格數據
            period: 計算週期
            
        Returns:
            ROC 值陣列
        """
        data = cls.validate_data(data)
        
        roc = np.full(len(data), np.nan)
        roc[period:] = ((data[period:] - data[:-period]) / data[:-period]) * 100
        
        return roc

    @classmethod
    def momentum(cls, data: Union[pd.Series, np.ndarray], period: int = 10) -> np.ndarray:
        """
        動量指標 (Momentum)
        
        Args:
            data: 價格數據
            period: 計算週期
            
        Returns:
            動量值陣列
        """
        data = cls.validate_data(data)
        
        momentum = np.full(len(data), np.nan)
        momentum[period:] = data[period:] - data[:-period]
        
        return momentum

    @classmethod
    def trix(cls, data: Union[pd.Series, np.ndarray], period: int = 14) -> np.ndarray:
        """
        TRIX 指標 (三重指數平滑移動平均)
        
        Args:
            data: 價格數據
            period: 計算週期
            
        Returns:
            TRIX 值陣列
        """
        data = cls.validate_data(data)
        
        # 三重指數平滑
        ema1 = cls.exponential_moving_average(data, period)
        ema2 = cls.exponential_moving_average(ema1, period)
        ema3 = cls.exponential_moving_average(ema2, period)
        
        # 計算 TRIX (百分比變化)
        trix = np.full(len(data), np.nan)
        trix[1:] = ((ema3[1:] - ema3[:-1]) / ema3[:-1]) * 10000
        
        return trix

    # ========== 輔助方法 ==========
    
    @classmethod
    def normalize(cls, data: np.ndarray, method: str = 'minmax') -> np.ndarray:
        """
        數據正規化
        
        Args:
            data: 輸入數據
            method: 正規化方法 ('minmax', 'zscore')
            
        Returns:
            正規化後的數據
        """
        data = cls.validate_data(data)
        
        if method == 'minmax':
            min_val = np.nanmin(data)
            max_val = np.nanmax(data)
            return (data - min_val) / (max_val - min_val + 1e-10)
        elif method == 'zscore':
            mean_val = np.nanmean(data)
            std_val = np.nanstd(data)
            return (data - mean_val) / (std_val + 1e-10)
        else:
            raise ValueError(f"不支援的正規化方法: {method}")

    @classmethod
    def crossover(cls, series1: np.ndarray, series2: np.ndarray) -> np.ndarray:
        """
        檢測交叉信號
        
        Args:
            series1: 第一個序列
            series2: 第二個序列
            
        Returns:
            交叉信號陣列 (1: 向上交叉, -1: 向下交叉, 0: 無交叉)
        """
        series1 = cls.validate_data(series1)
        series2 = cls.validate_data(series2)
        
        diff = series1 - series2
        crossover_signals = np.zeros(len(diff))
        
        for i in range(1, len(diff)):
            if diff[i-1] <= 0 and diff[i] > 0:
                crossover_signals[i] = 1  # 向上交叉
            elif diff[i-1] >= 0 and diff[i] < 0:
                crossover_signals[i] = -1  # 向下交叉
        
        return crossover_signals


# 性能優化的向量化函數
@jit(nopython=True)
def fast_ema(data, period):
    """使用 Numba 優化的快速 EMA 計算"""
    alpha = 2.0 / (period + 1)
    ema = np.full(len(data), np.nan)
    ema[0] = data[0]
    
    for i in range(1, len(data)):
        ema[i] = alpha * data[i] + (1 - alpha) * ema[i-1]
    
    return ema


@jit(nopython=True)
def fast_rsi(data, period):
    """使用 Numba 優化的快速 RSI 計算"""
    delta = np.diff(data)
    gain = np.where(delta > 0, delta, 0.0)
    loss = np.where(delta < 0, -delta, 0.0)
    
    # 初始平均值
    avg_gain = np.mean(gain[:period])
    avg_loss = np.mean(loss[:period])
    
    rsi = np.full(len(data), np.nan)
    
    for i in range(period, len(data)):
        if i == period:
            avg_gain = np.mean(gain[:period])
            avg_loss = np.mean(loss[:period])
        else:
            avg_gain = (avg_gain * (period - 1) + gain[i-1]) / period
            avg_loss = (avg_loss * (period - 1) + loss[i-1]) / period
        
        rs = avg_gain / (avg_loss + 1e-10)
        rsi[i] = 100 - (100 / (1 + rs))
    
    return rsi


if __name__ == "__main__":
    # 測試範例
    np.random.seed(42)
    
    # 生成測試數據
    n = 1000
    price_base = 100
    returns = np.random.normal(0.001, 0.02, n)
    prices = price_base * np.exp(np.cumsum(returns))
    
    # 生成 OHLC 數據
    high = prices * (1 + np.abs(np.random.normal(0, 0.01, n)))
    low = prices * (1 - np.abs(np.random.normal(0, 0.01, n)))
    volume = np.random.randint(1000, 10000, n)
    
    print("技術指標計算範例:")
    print("="*50)
    
    # 測試各種指標
    ti = TechnicalIndicators()
    
    # 趨勢指標
    sma = ti.simple_moving_average(prices, 20)
    ema = ti.exponential_moving_average(prices, 20)
    macd_line, signal_line, histogram = ti.macd(prices)
    
    print(f"SMA (最後5個值): {sma[-5:]}")
    print(f"EMA (最後5個值): {ema[-5:]}")
    print(f"MACD (最後5個值): {macd_line[-5:]}")
    
    # 振盪指標
    rsi = ti.rsi(prices)
    k_percent, d_percent = ti.stochastic_oscillator(high, low, prices)
    
    print(f"RSI (最後5個值): {rsi[-5:]}")
    print(f"Stochastic %K (最後5個值): {k_percent[-5:]}")
    
    # 波動率指標
    upper, middle, lower = ti.bollinger_bands(prices)
    atr = ti.atr(high, low, prices)
    
    print(f"布林帶上軌 (最後5個值): {upper[-5:]}")
    print(f"ATR (最後5個值): {atr[-5:]}")
    
    # 成交量指標
    obv = ti.obv(prices, volume)
    mfi = ti.mfi(high, low, prices, volume)
    
    print(f"OBV (最後5個值): {obv[-5:]}")
    print(f"MFI (最後5個值): {mfi[-5:]}")
    
    print("\n指標計算完成！")