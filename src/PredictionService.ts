export interface SignalTrend {
  jobsCount: number;
  fundingAmount: number;
  layoffsCount: number;
  hiringVelocity: number;
  toolAdoption: number;
  timestamp: string;
}

export interface PredictionResult {
  pressureForecast: 'rising' | 'stable' | 'falling';
  momentumScore: number;
  explanation: string;
  confidence: number;
}

export class PredictionService {
  private static parseSignalValue(value: string, type: 'count' | 'amount' | 'velocity' | 'adoption'): number {
    const numbers = value.match(/\d+/g);
    if (!numbers || numbers.length === 0) return 0;

    const firstNumber = parseInt(numbers[0], 10);

    if (type === 'amount' && value.toLowerCase().includes('series')) {
      return firstNumber;
    }

    if (type === 'velocity' && value.includes('↑')) {
      return firstNumber;
    } else if (type === 'velocity' && value.includes('↓')) {
      return -firstNumber;
    }

    if (type === 'adoption' && value.includes('%')) {
      return firstNumber;
    }

    return firstNumber;
  }

  static extractSignalTrend(signals: {
    jobs: { value: string };
    funding: { value: string };
    layoffs: { value: string };
    hiringVelocity: { value: string };
    toolAdoption: { value: string };
  }): SignalTrend {
    return {
      jobsCount: this.parseSignalValue(signals.jobs.value, 'count'),
      fundingAmount: this.parseSignalValue(signals.funding.value, 'amount'),
      layoffsCount: this.parseSignalValue(signals.layoffs.value, 'count'),
      hiringVelocity: this.parseSignalValue(signals.hiringVelocity.value, 'velocity'),
      toolAdoption: this.parseSignalValue(signals.toolAdoption.value, 'adoption'),
      timestamp: new Date().toISOString(),
    };
  }

  static calculateMovingAverage(values: number[]): number {
    if (values.length === 0) return 0;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
  }

  static predictPressure(
    historicalTrends: SignalTrend[],
    currentSignals: {
      jobs: { value: string };
      funding: { value: string };
      layoffs: { value: string };
      hiringVelocity: { value: string };
      toolAdoption: { value: string };
    }
  ): PredictionResult {
    const currentTrend = this.extractSignalTrend(currentSignals);

    if (historicalTrends.length < 2) {
      return {
        pressureForecast: 'stable',
        momentumScore: 0,
        explanation: 'Insufficient historical data. Continue monitoring for trend analysis.',
        confidence: 30,
      };
    }

    const recentTrends = historicalTrends.slice(-7);

    const jobsMA = this.calculateMovingAverage(recentTrends.map(t => t.jobsCount));
    const fundingMA = this.calculateMovingAverage(recentTrends.map(t => t.fundingAmount));
    const layoffsMA = this.calculateMovingAverage(recentTrends.map(t => t.layoffsCount));
    const hiringVelocityMA = this.calculateMovingAverage(recentTrends.map(t => t.hiringVelocity));
    const toolAdoptionMA = this.calculateMovingAverage(recentTrends.map(t => t.toolAdoption));

    const jobsDelta = currentTrend.jobsCount - jobsMA;
    const fundingDelta = currentTrend.fundingAmount - fundingMA;
    const layoffsDelta = currentTrend.layoffsCount - layoffsMA;
    const hiringVelocityDelta = currentTrend.hiringVelocity - hiringVelocityMA;
    const toolAdoptionDelta = currentTrend.toolAdoption - toolAdoptionMA;

    const weightedPressureScore =
      (jobsDelta > 0 ? 1 : jobsDelta < 0 ? -1 : 0) * 0.25 +
      (fundingDelta > 0 ? 1 : fundingDelta < 0 ? -1 : 0) * 0.30 +
      (layoffsDelta > 0 ? 1 : layoffsDelta < 0 ? -1 : 0) * 0.15 +
      (hiringVelocityDelta > 0 ? 1 : hiringVelocityDelta < 0 ? -1 : 0) * 0.20 +
      (toolAdoptionDelta > 0 ? 1 : toolAdoptionDelta < 0 ? -1 : 0) * 0.10;

    const momentumScore = Math.round(
      (Math.abs(jobsDelta) * 0.25 +
        Math.abs(fundingDelta) * 0.30 +
        Math.abs(layoffsDelta) * 0.15 +
        Math.abs(hiringVelocityDelta) * 0.20 +
        Math.abs(toolAdoptionDelta) * 0.10) *
        10
    );

    let pressureForecast: 'rising' | 'stable' | 'falling';
    let explanation: string;
    let confidence: number;

    if (weightedPressureScore > 0.25) {
      pressureForecast = 'rising';
      explanation = 'Multiple signals indicate increasing market pressure. Consider accelerating outreach.';
      confidence = Math.min(95, 60 + momentumScore);
    } else if (weightedPressureScore < -0.25) {
      pressureForecast = 'falling';
      explanation = 'Pressure signals declining. Focus on existing relationships and pipeline nurturing.';
      confidence = Math.min(95, 60 + momentumScore);
    } else {
      pressureForecast = 'stable';
      explanation = 'Market signals stable. Maintain current momentum and watch for shifts.';
      confidence = Math.min(85, 50 + momentumScore);
    }

    return {
      pressureForecast,
      momentumScore,
      explanation,
      confidence,
    };
  }
}
