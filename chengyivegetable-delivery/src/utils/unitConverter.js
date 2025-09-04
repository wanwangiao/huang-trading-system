/**
 * 單位換算工具類
 * 支援：公克、公斤、斤、台斤之間的相互換算
 */

class UnitConverter {
    // 換算常數定義
    static CONVERSION_RATES = {
        // 基礎換算關係（以公克為基準）
        GRAM_TO_KG: 0.001,        // 1克 = 0.001公斤
        KG_TO_GRAM: 1000,          // 1公斤 = 1000克
        JIN_TO_GRAM: 600,          // 1斤 = 600克
        GRAM_TO_JIN: 1/600,        // 1克 = 0.00167斤
        TAIWAN_TO_GRAM: 600,       // 1台斤 = 600克
        GRAM_TO_TAIWAN: 1/600,     // 1克 = 0.00167台斤
        
        // 衍生換算關係
        JIN_TO_KG: 0.6,            // 1斤 = 0.6公斤
        KG_TO_JIN: 5/3,            // 1公斤 = 1.67斤
        TAIWAN_TO_KG: 0.6,         // 1台斤 = 0.6公斤
        KG_TO_TAIWAN: 5/3          // 1公斤 = 1.67台斤
    };

    /**
     * 標準化單位名稱
     */
    static normalizeUnit(unit) {
        if (!unit) return null;
        
        const unitMap = {
            '克': 'gram',
            '公克': 'gram',
            'g': 'gram',
            'gram': 'gram',
            'grams': 'gram',
            
            '公斤': 'kg',
            '千克': 'kg',
            'kg': 'kg',
            'kilogram': 'kg',
            'kilograms': 'kg',
            
            '斤': 'jin',
            'jin': 'jin',
            'catty': 'jin',
            
            '台斤': 'taiwan_jin',
            '臺斤': 'taiwan_jin',
            'taiwan_jin': 'taiwan_jin',
            'taiwanese_catty': 'taiwan_jin'
        };
        
        const normalized = unit.toLowerCase().trim();
        return unitMap[normalized] || null;
    }

    /**
     * 將任何單位轉換為公克（基準單位）
     */
    static toGrams(value, unit) {
        const normalizedUnit = this.normalizeUnit(unit);
        
        if (!normalizedUnit) {
            console.warn(`不支援的單位: ${unit}`);
            return value;
        }
        
        switch(normalizedUnit) {
            case 'gram':
                return value;
            case 'kg':
                return value * this.CONVERSION_RATES.KG_TO_GRAM;
            case 'jin':
                return value * this.CONVERSION_RATES.JIN_TO_GRAM;
            case 'taiwan_jin':
                return value * this.CONVERSION_RATES.TAIWAN_TO_GRAM;
            default:
                return value;
        }
    }
    
    /**
     * 從公克轉換為其他單位
     */
    static fromGrams(grams, targetUnit) {
        const normalizedUnit = this.normalizeUnit(targetUnit);
        
        if (!normalizedUnit) {
            console.warn(`不支援的單位: ${targetUnit}`);
            return grams;
        }
        
        switch(normalizedUnit) {
            case 'gram':
                return grams;
            case 'kg':
                return grams * this.CONVERSION_RATES.GRAM_TO_KG;
            case 'jin':
                return grams * this.CONVERSION_RATES.GRAM_TO_JIN;
            case 'taiwan_jin':
                return grams * this.CONVERSION_RATES.GRAM_TO_TAIWAN;
            default:
                return grams;
        }
    }
    
    /**
     * 通用轉換函數
     * @param {number} value - 要轉換的數值
     * @param {string} fromUnit - 原始單位
     * @param {string} toUnit - 目標單位
     * @returns {number} 轉換後的數值
     */
    static convert(value, fromUnit, toUnit) {
        // 如果單位相同，直接返回
        if (this.normalizeUnit(fromUnit) === this.normalizeUnit(toUnit)) {
            return value;
        }
        
        // 先轉換為公克，再轉換為目標單位
        const grams = this.toGrams(value, fromUnit);
        return this.fromGrams(grams, toUnit);
    }
    
    /**
     * 格式化顯示（保留適當的小數位）
     */
    static formatWeight(value, unit, decimals = 2) {
        const formatted = Number(value).toFixed(decimals);
        // 移除不必要的零
        const cleaned = parseFloat(formatted).toString();
        return `${cleaned}${unit}`;
    }
    
    /**
     * 批量轉換
     * @param {Array} items - [{value: 100, unit: '克'}, ...]
     * @param {string} targetUnit - 目標單位
     */
    static batchConvert(items, targetUnit) {
        return items.map(item => ({
            original: item,
            converted: {
                value: this.convert(item.value, item.unit, targetUnit),
                unit: targetUnit
            }
        }));
    }
    
    /**
     * 獲取單位顯示名稱
     */
    static getUnitDisplayName(unit) {
        const displayNames = {
            'gram': '公克',
            'kg': '公斤',
            'jin': '斤',
            'taiwan_jin': '台斤'
        };
        
        const normalized = this.normalizeUnit(unit);
        return displayNames[normalized] || unit;
    }
    
    /**
     * 獲取所有支援的單位列表
     */
    static getSupportedUnits() {
        return [
            { value: 'gram', label: '公克', symbol: 'g' },
            { value: 'kg', label: '公斤', symbol: 'kg' },
            { value: 'jin', label: '斤', symbol: '斤' },
            { value: 'taiwan_jin', label: '台斤', symbol: '台斤' }
        ];
    }
    
    /**
     * 計算價格（根據單位換算）
     * @param {number} pricePerUnit - 每單位價格
     * @param {string} priceUnit - 價格單位
     * @param {number} quantity - 購買數量
     * @param {string} quantityUnit - 購買單位
     */
    static calculatePrice(pricePerUnit, priceUnit, quantity, quantityUnit) {
        // 將購買數量轉換為價格單位
        const convertedQuantity = this.convert(quantity, quantityUnit, priceUnit);
        return pricePerUnit * convertedQuantity;
    }
}

// 導出供其他模組使用
module.exports = UnitConverter;