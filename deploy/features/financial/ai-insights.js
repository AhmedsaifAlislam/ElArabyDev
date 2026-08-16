// ==================== العربية CRM - محرك الذكاء الاصطناعي المحلي ====================
// 10 ميزات ذكية — كلها تعمل بدون إنترنت

const AIInsights = {

  // ═══════════ 1. ملخص ذكي ═══════════
  generateSmartSummary(parsedRows, balance, transfers, damagedParts) {
    const totalMovements = parsedRows.length;
    const totalTransfers = transfers.reduce((s, t) => s + t.amount, 0);
    const totalDamaged = damagedParts.reduce((s, p) => s + p.amount, 0);
    const netPosition = totalTransfers - totalDamaged;

    let summary = `📊 ملخص الحالة المالية للمركز\n\n`;

    if (balance < 0) {
      summary += `✅ الشركة ليها عليك ${formatEGP(Math.abs(balance))} — ده معناه إن المركز مدين للشركة.\n`;
    } else if (balance > 0) {
      summary += `⚠️ أنت مدين للشركة بـ ${formatEGP(balance)}.\n`;
    } else {
      summary += `⚖️ الحساب متوازن.\n`;
    }

    summary += `\n📈 الإحصائيات:\n`;
    summary += `• إجمالي الحركات: ${totalMovements} حركة\n`;
    summary += `• التحويلات البنكية: ${transfers.length} تحويل بقيمة ${formatEGP(totalTransfers)}\n`;
    summary += `• فواتير التالف: ${damagedParts.length} قطعة بقيمة ${formatEGP(totalDamaged)}\n`;

    if (netPosition > 0) {
      summary += `\n💡 النتيجة الصافية: المركز كاسب ${formatEGP(netPosition)} بعد خصم التالف من التحويلات.`;
    } else if (netPosition < 0) {
      summary += `\n⚠️ النتيجة الصافية: المركز خسر ${formatEGP(Math.abs(netPosition))} بعد خصم التالف من التحويلات.`;
    }

    return summary;
  },

  // ═══════════ 2. كشف الشذوذ ═══════════
  detectAnomalies(parsedRows) {
    const anomalies = [];
    const amounts = parsedRows.map(r => Math.abs(r.amount || 0)).filter(a => a > 0);

    if (amounts.length < 3) return anomalies;

    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const stdDev = Math.sqrt(amounts.reduce((s, a) => s + Math.pow(a - mean, 2), 0) / amounts.length);
    const threshold = mean + (2 * stdDev);

    parsedRows.forEach(row => {
      const amount = Math.abs(row.amount || 0);
      if (amount > threshold && amount > 1000) {
        anomalies.push({
          type: 'high_amount',
          severity: amount > threshold * 2 ? 'high' : 'medium',
          date: row.postingDate || row.docDate,
          material: row.materialDesc || row.text || '',
          amount: amount,
          message: `مبلغ غير عادي: ${formatEGP(amount)} (المتوسط: ${formatEGP(mean)})`,
          recommendation: 'راجع الفاتورة وتأكد من صحتها'
        });
      }
    });

    const priceMap = {};
    parsedRows.forEach(row => {
      if (row.material && row.amount) {
        const key = row.material;
        if (!priceMap[key]) priceMap[key] = [];
        priceMap[key].push(Math.abs(row.amount));
      }
    });

    for (const [material, prices] of Object.entries(priceMap)) {
      if (prices.length >= 2) {
        const maxPrice = Math.max(...prices);
        const minPrice = Math.min(...prices);
        const changePercent = ((maxPrice - minPrice) / minPrice) * 100;

        if (changePercent > 20) {
          anomalies.push({
            type: 'price_change',
            severity: changePercent > 50 ? 'high' : 'medium',
            material: material,
            prices: prices,
            changePercent: changePercent,
            message: `تغير سعر المادة ${material} بنسبة ${changePercent.toFixed(1)}%`,
            recommendation: 'تأكد من سبب تغير السعر'
          });
        }
      }
    }

    return anomalies;
  },

  // ═══════════ 3. تنبؤ الرصيد ═══════════
  predictBalance(parsedRows, currentBalance) {
    const monthlyData = {};
    parsedRows.forEach(row => {
      const match = (row.dateStr || '').match(/(\d{4})[-/](\d{2})/);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!monthlyData[key]) monthlyData[key] = { income: 0, expense: 0 };
        const amount = row.amount || 0;
        if (amount > 0) monthlyData[key].income += amount;
        else monthlyData[key].expense += Math.abs(amount);
      }
    });

    const months = Object.entries(monthlyData).sort();
    if (months.length < 2) {
      return {
        prediction: currentBalance,
        confidence: 'منخفض',
        message: 'بيانات غير كافية للتنبأ'
      };
    }

    const netFlows = months.map(([, data]) => data.income - data.expense);
    const avgFlow = netFlows.reduce((s, f) => s + f, 0) / netFlows.length;
    const predictedBalance = currentBalance + avgFlow;

    let trend = 'مستقر';
    if (netFlows.length >= 3) {
      const recent = netFlows.slice(-3);
      const isIncreasing = recent[2] > recent[1] && recent[1] > recent[0];
      const isDecreasing = recent[2] < recent[1] && recent[1] < recent[0];
      if (isIncreasing) trend = 'صاعد';
      if (isDecreasing) trend = 'هابط';
    }

    return {
      currentBalance: currentBalance,
      predictedBalance: predictedBalance,
      avgMonthlyFlow: avgFlow,
      trend: trend,
      confidence: months.length >= 6 ? 'عالي' : 'متوسط',
      message: `الرصيد المتوقع: ${formatEGP(predictedBalance)} — الاتجاه: ${trend}`
    };
  },

  // ═══════════ 4. تصنيف تلقائي ═══════════
  categorizeTransactions(parsedRows) {
    const categories = {
      invoices: { name: 'فواتير مبيعات', rows: [], total: 0 },
      returns: { name: 'مرتجعات', rows: [], total: 0 },
      transfers: { name: 'تحويلات بنكية', rows: [], total: 0 },
      damaged: { name: 'تالف', rows: [], total: 0 },
      adjustments: { name: 'تسويات', rows: [], total: 0 },
      other: { name: 'أخرى', rows: [], total: 0 }
    };

    parsedRows.forEach(row => {
      const desc = ((row.text || '') + ' ' + (row.materialDesc || '') + ' ' + (row.assignment || '')).toLowerCase();
      const docType = (row.docType || '').toUpperCase();
      const billingType = (row.billingType || '').toUpperCase();

      if (docType === 'SU' || desc.includes('تحويل بنكي') || desc.includes('bank')) {
        categories.transfers.rows.push(row);
        categories.transfers.total += Math.abs(row.amount || 0);
      } else if (desc.includes('تالف') || desc.includes('لم يسلم') || billingType === 'L2') {
        categories.damaged.rows.push(row);
        categories.damaged.total += Math.abs(row.amount || 0);
      } else if (docType === 'DG' || desc.includes('مرتجع') || desc.includes('return')) {
        categories.returns.rows.push(row);
        categories.returns.total += Math.abs(row.amount || 0);
      } else if (docType === 'RV' || docType === 'ZF2') {
        categories.invoices.rows.push(row);
        categories.invoices.total += Math.abs(row.amount || 0);
      } else if (docType === 'SA' || docType === 'AB') {
        categories.adjustments.rows.push(row);
        categories.adjustments.total += Math.abs(row.amount || 0);
      } else {
        categories.other.rows.push(row);
        categories.other.total += Math.abs(row.amount || 0);
      }
    });

    return categories;
  },

  // ═══════════ 5. رؤى ذكية ═══════════
  generateInsights(parsedRows, balance, transfers, damagedParts, categories) {
    const insights = [];

    if (damagedParts.length > 0) {
      const totalDamaged = damagedParts.reduce((s, p) => s + p.amount, 0);
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'فواتير التالف',
        message: `عندك ${damagedParts.length} قطعة تالفة بقيمة ${formatEGP(totalDamaged)}. ده بيخلي الفلوس تروح من المركز من غير ما يتعوض.`,
        action: 'تابع إرجاع القطع التالفة من الفنيين'
      });
    }

    if (transfers.length > 0) {
      const totalTransfers = transfers.reduce((s, t) => s + t.amount, 0);
      insights.push({
        type: 'positive',
        icon: '💰',
        title: 'التحويلات البنكية',
        message: `الشركة بعتتلك ${formatEGP(totalTransfers)} في ${transfers.length} تحويل. ده بيقلل من إجمالي المديونية.`,
        action: 'تأكد من استلام كل التحويلات'
      });
    }

    const expensiveParts = parsedRows.filter(r => Math.abs(r.amount || 0) >= 5000);
    if (expensiveParts.length > 0) {
      insights.push({
        type: 'info',
        icon: '💡',
        title: 'قطع غالية',
        message: `عندك ${expensiveParts.length} قطعة بسعر فوق 5000 ج.م. تأكد إنها اتثبتت صح.`,
        action: 'راجع فواتير القطع الغالية'
      });
    }

    const monthlyStats = {};
    parsedRows.forEach(row => {
      const match = (row.dateStr || '').match(/(\d{4})[-/](\d{2})/);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!monthlyStats[key]) monthlyStats[key] = 0;
        monthlyStats[key] += Math.abs(row.amount || 0);
      }
    });

    const months = Object.entries(monthlyStats).sort();
    if (months.length >= 2) {
      const lastMonth = months[months.length - 1][1];
      const prevMonth = months[months.length - 2][1];
      const changePercent = ((lastMonth - prevMonth) / prevMonth) * 100;

      if (changePercent > 30) {
        insights.push({
          type: 'warning',
          icon: '📈',
          title: 'زيادة كبيرة',
          message: `الحركة زادت ${changePercent.toFixed(1)}% عن الشهر اللي فات. تأكد من السبب.`,
          action: 'راجع الفواتير الجديدة'
        });
      } else if (changePercent < -30) {
        insights.push({
          type: 'info',
          icon: '📉',
          title: 'نقص في الحركة',
          message: `الحركة نقصت ${Math.abs(changePercent).toFixed(1)}% عن الشهر اللي فات.`,
          action: 'تأكد من إصدار كل الفواتير المطلوبة'
        });
      }
    }

    if (balance < -100000) {
      insights.push({
        type: 'danger',
        icon: '🚨',
        title: 'مديونية كبيرة',
        message: `المركز مديون بـ ${formatEGP(Math.abs(balance))}. ده مبلغ كبير ومتراكم.`,
        action: 'تابع مع الشركة لترتيب السداد'
      });
    }

    if (insights.length === 0) {
      insights.push({
        type: 'success',
        icon: '✅',
        title: 'كل حاجة تمام',
        message: 'لا توجد مشاكل مالية حالية.',
        action: 'تابع بشكل دوري'
      });
    }

    return insights;
  },

  // ═══════════ 6. مؤشر الأداء ═══════════
  calculatePerformanceScore(parsedRows, balance, transfers, damagedParts) {
    let score = 100;
    const details = [];

    if (damagedParts.length > 0) {
      const damagedPercent = (damagedParts.length / parsedRows.length) * 100;
      const penalty = Math.min(30, damagedPercent * 3);
      score -= penalty;
      details.push({ item: 'التالف', impact: -penalty, reason: `${damagedParts.length} قطعة تالفة` });
    }

    if (balance < -50000) {
      const penalty = Math.min(20, Math.abs(balance) / 10000);
      score -= penalty;
      details.push({ item: 'المديونية', impact: -penalty, reason: `رصيد سالب ${formatEGP(Math.abs(balance))}` });
    }

    if (transfers.length === 0 && parsedRows.length > 10) {
      score -= 10;
      details.push({ item: 'التحويلات', impact: -10, reason: 'لا توجد تحويلات بنكية' });
    }

    const amounts = parsedRows.map(r => Math.abs(r.amount || 0)).filter(a => a > 0);
    if (amounts.length > 0) {
      const maxAmount = Math.max(...amounts);
      const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
      if (maxAmount > mean * 5) {
        score -= 10;
        details.push({ item: 'الفروقات', impact: -10, reason: 'هناك فروقات كبيرة في المبالغ' });
      }
    }

    score = Math.max(0, Math.min(100, Math.round(score)));

    let grade = 'A';
    let color = '#2e7d32';
    if (score < 90) { grade = 'B'; color = '#1565c0'; }
    if (score < 75) { grade = 'C'; color = '#e65100'; }
    if (score < 60) { grade = 'D'; color = '#c62828'; }

    return { score, grade, color, details };
  },

  // ═══════════ 7. مقارنة ذكية ═══════════
  comparePeriods(parsedRows) {
    const monthlyData = {};
    parsedRows.forEach(row => {
      const match = (row.dateStr || '').match(/(\d{4})[-/](\d{2})/);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!monthlyData[key]) monthlyData[key] = { count: 0, total: 0, transfers: 0, damaged: 0 };
        monthlyData[key].count++;
        monthlyData[key].total += Math.abs(row.amount || 0);
        if (row.docType === 'SU') monthlyData[key].transfers += Math.abs(row.amount || 0);
        if ((row.text || '').includes('تالف') || (row.billingType || '') === 'L2') monthlyData[key].damaged += Math.abs(row.amount || 0);
      }
    });

    const months = Object.entries(monthlyData).sort();
    if (months.length < 2) return { message: 'بيانات غير كافية للمقارنة' };

    const [prevMonth, prevData] = months[months.length - 2];
    const [currMonth, currData] = months[months.length - 1];

    const comparisons = [
      { label: 'عدد الحركات', prev: prevData.count, curr: currData.count },
      { label: 'إجمالي المبالغ', prev: prevData.total, curr: currData.total, format: true },
      { label: 'التحويلات', prev: prevData.transfers, curr: currData.transfers, format: true },
      { label: 'التالف', prev: prevData.damaged, curr: currData.damaged, format: true }
    ];

    return { prevMonth, currMonth, comparisons };
  },

  // ═══════════ 8. تحليل الاتجاهات ═══════════
  analyzeTrends(parsedRows) {
    const monthlyData = {};
    parsedRows.forEach(row => {
      const match = (row.dateStr || '').match(/(\d{4})[-/](\d{2})/);
      if (match) {
        const key = `${match[1]}-${match[2]}`;
        if (!monthlyData[key]) monthlyData[key] = { count: 0, total: 0 };
        monthlyData[key].count++;
        monthlyData[key].total += Math.abs(row.amount || 0);
      }
    });

    const months = Object.entries(monthlyData).sort();
    if (months.length < 3) return { trend: 'غير كافٍ', message: 'بيانات غير كافية لتحليل الاتجاهات' };

    const totals = months.map(([, d]) => d.total);
    const counts = months.map(([, d]) => d.count);

    const avgTotal = totals.reduce((s, t) => s + t, 0) / totals.length;
    const avgCount = counts.reduce((s, c) => s + c, 0) / counts.length;

    const recentTotals = totals.slice(-3);
    const isIncreasing = recentTotals[2] > recentTotals[1] && recentTotals[1] > recentTotals[0];
    const isDecreasing = recentTotals[2] < recentTotals[1] && recentTotals[1] < recentTotals[0];

    let trend = 'مستقر';
    let message = 'الحركة مستقرة نسبياً';

    if (isIncreasing) {
      trend = 'صاعد';
      message = 'الحركة في ازدياد — تأكد من إن الفواتير صحيحة';
    } else if (isDecreasing) {
      trend = 'هابط';
      message = 'الحركة في نقص — تأكد من إصدار كل الفواتير';
    }

    return {
      trend,
      message,
      avgMonthlyTotal: avgTotal,
      avgMonthlyCount: avgCount,
      recentMonths: months.slice(-3).map(([m, d]) => ({ month: m, total: d.total, count: d.count }))
    };
  },

  // ═══════════ 9. تقييم المخاطر ═══════════
  assessRisks(parsedRows, balance, damagedParts, transfers) {
    const risks = [];

    if (balance < -100000) {
      risks.push({
        level: 'عالي',
        color: '#c62828',
        title: 'مديونية متراكمة',
        description: `المركز مديون بـ ${formatEGP(Math.abs(balance))} — ده مبلغ كبير ممكن يسبب مشاكل`,
        recommendation: 'تواصل مع الشركة لترتيب خطة سداد'
      });
    }

    const damagedCount = damagedParts.length;
    if (damagedCount > 5) {
      risks.push({
        level: 'متوسط',
        color: '#e65100',
        title: 'كثرة التالف',
        description: `${damagedCount} قطعة تالفة — ده بيزيد من الخصومات`,
        recommendation: 'تابع مع الفنيين لتحسين جودة الخدمة'
      });
    }

    if (transfers.length === 0 && parsedRows.length > 20) {
      risks.push({
        level: 'متوسط',
        color: '#e65100',
        title: 'لا توجد تحويلات',
        description: 'الشركة مش بتبعتلك تحويلات — تأكد من إن الفواتير صحيحة',
        recommendation: 'راجع حالة الفواتير مع الشركة'
      });
    }

    const amounts = parsedRows.map(r => Math.abs(r.amount || 0)).filter(a => a > 0);
    if (amounts.length > 0) {
      const maxAmount = Math.max(...amounts);
      if (maxAmount > 50000) {
        risks.push({
          level: 'منخفض',
          color: '#1565c0',
          title: 'مبلغ كبير',
          description: `هناك فاتورة بقيمة ${formatEGP(maxAmount)}`,
          recommendation: 'تأكد من صحة الفاتورة'
        });
      }
    }

    if (risks.length === 0) {
      risks.push({
        level: 'منخفض',
        color: '#2e7d32',
        title: 'لا توجد مخاطر كبيرة',
        description: 'الوضع المالي مستقر نسبياً',
        recommendation: 'تابع بشكل دوري'
      });
    }

    return risks;
  },

  // ═══════════ 10. تقرير آلي ═══════════
  generateAutoReport(pageData, parsedRows, balance, transfers, damagedParts, categories, score, insights, risks) {
    const now = new Date();
    const dateStr = now.toLocaleDateString('ar-EG');
    const timeStr = now.toLocaleTimeString('ar-EG');

    let report = '';
    report += `╔══════════════════════════════════════════════╗\n`;
    report += `║     تقرير مالي — مركز الخدمة                 ║\n`;
    report += `║     التاريخ: ${dateStr} ${timeStr}        ║\n`;
    report += `╚══════════════════════════════════════════════╝\n\n`;

    report += `📍 مركز الخدمة: ${pageData.accountName || pageData.accountNumber || 'غير محدد'}\n`;
    report += `📊 الصفحة: ${pageData.page?.name || 'غير معروف'}\n\n`;

    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    report += `📈 مؤشر الأداء: ${score.score}/100 (صفة ${score.grade})\n`;
    report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    report += `💰 الرصيد الحالي: ${formatEGP(Math.abs(balance))}\n`;
    report += `   ${balance < 0 ? 'الشركة ليها عليك' : balance > 0 ? 'أنت مدين للشركة' : 'الحساب متوازن'}\n\n`;

    report += `📊 الإحصائيات:\n`;
    report += `• إجمالي الحركات: ${parsedRows.length}\n`;
    report += `• التحويلات البنكية: ${transfers.length} بقيمة ${formatEGP(transfers.reduce((s, t) => s + t.amount, 0))}\n`;
    report += `• فواتير التالف: ${damagedParts.length} بقيمة ${formatEGP(damagedParts.reduce((s, p) => s + p.amount, 0))}\n\n`;

    if (categories) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `📋 تصنيف المعاملات:\n`;
      for (const [key, cat] of Object.entries(categories)) {
        if (cat.rows.length > 0) {
          report += `• ${cat.name}: ${cat.rows.length} حركة — ${formatEGP(cat.total)}\n`;
        }
      }
      report += `\n`;
    }

    if (insights && insights.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `💡 الرؤى الذكية:\n`;
      insights.forEach(i => {
        report += `${i.icon} ${i.title}: ${i.message}\n`;
      });
      report += `\n`;
    }

    if (risks && risks.length > 0) {
      report += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
      report += `⚠️ تقييم المخاطر:\n`;
      risks.forEach(r => {
        report += `[${r.level}] ${r.title}: ${r.description}\n`;
      });
    }

    return report;
  }
};

function formatEGP(amount) {
  const rounded = Math.round(amount);
  return rounded.toLocaleString('ar-EG') + ' ج.م';
}
