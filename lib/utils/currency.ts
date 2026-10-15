// path: lib/utils/currency.ts
// Money type (USD only). All arithmetic uses decimal.js; JavaScript Number is never used for money.
import Decimal from 'decimal.js';

/** Dedicated Decimal constructor so global Decimal settings never change money behaviour. */
const D = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});

export const BASE_CURRENCY = 'USD' as const;
export type BaseCurrency = typeof BASE_CURRENCY;
/** Number of decimal places stored in the database: numeric(18,4). */
export const MONEY_SCALE = 4;
/** Largest absolute value that fits numeric(18,4). */
const MAX_ABSOLUTE = new D('99999999999999.9999');

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/;

export type MoneyLike = Money | string;

export class Money {
  private readonly value: Decimal;

  private constructor(value: Decimal) {
    if (!value.isFinite()) throw new RangeError('Money must be a finite number.');
    const rounded = value.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);
    if (rounded.abs().gt(MAX_ABSOLUTE))
      throw new RangeError('Money is outside the numeric(18,4) range.');
    this.value = rounded;
  }

  get currency(): BaseCurrency {
    return BASE_CURRENCY;
  }

  static zero(): Money {
    return new Money(new D(0));
  }

  /** Parses decimal text with at most four decimal places, for example "12.5" or "-3.0001". */
  static parse(input: string): Money {
    const text = input.trim();
    if (!DECIMAL_TEXT.test(text))
      throw new RangeError('Money text must be a plain decimal number.');
    const fraction = text.split('.')[1];
    if (fraction !== undefined && fraction.length > MONEY_SCALE) {
      throw new RangeError(`Money allows at most ${MONEY_SCALE} decimal places.`);
    }
    return new Money(new D(text));
  }

  /** Parses decimal text and rounds half up to four decimal places. */
  static parseRounded(input: string): Money {
    const text = input.trim();
    if (!DECIMAL_TEXT.test(text))
      throw new RangeError('Money text must be a plain decimal number.');
    return new Money(new D(text));
  }

  static from(input: MoneyLike): Money {
    return typeof input === 'string' ? Money.parse(input) : input;
  }

  static sum(items: readonly Money[]): Money {
    return items.reduce((acc, item) => acc.add(item), Money.zero());
  }

  static max(a: Money, b: Money): Money {
    return a.gte(b) ? a : b;
  }

  static min(a: Money, b: Money): Money {
    return a.lte(b) ? a : b;
  }

  add(other: MoneyLike): Money {
    return new Money(this.value.plus(Money.from(other).value));
  }

  sub(other: MoneyLike): Money {
    return new Money(this.value.minus(Money.from(other).value));
  }

  /** Multiplies by a decimal factor given as text (quantity, rate). Rounds half up to four places. */
  mul(factor: string): Money {
    if (!DECIMAL_TEXT.test(factor.trim()))
      throw new RangeError('Factor must be a plain decimal number.');
    return new Money(this.value.times(new D(factor.trim())));
  }

  /** Divides by a non-zero decimal divisor given as text. Rounds half up to four places. */
  div(divisor: string): Money {
    if (!DECIMAL_TEXT.test(divisor.trim()))
      throw new RangeError('Divisor must be a plain decimal number.');
    const d = new D(divisor.trim());
    if (d.isZero()) throw new RangeError('Division by zero.');
    return new Money(this.value.div(d));
  }

  /** Returns this amount multiplied by a percentage, e.g. percent("7.5") is 7.5 percent of the amount. */
  percent(rate: string): Money {
    return this.mul(rate).div('100');
  }

  negate(): Money {
    return new Money(this.value.negated());
  }

  abs(): Money {
    return new Money(this.value.abs());
  }

  isZero(): boolean {
    return this.value.isZero();
  }

  isNegative(): boolean {
    return this.value.isNegative() && !this.value.isZero();
  }

  isPositive(): boolean {
    return this.value.isPositive() && !this.value.isZero();
  }

  cmp(other: MoneyLike): -1 | 0 | 1 {
    return this.value.comparedTo(Money.from(other).value) as -1 | 0 | 1;
  }

  eq(other: MoneyLike): boolean {
    return this.cmp(other) === 0;
  }

  gt(other: MoneyLike): boolean {
    return this.cmp(other) > 0;
  }

  gte(other: MoneyLike): boolean {
    return this.cmp(other) >= 0;
  }

  lt(other: MoneyLike): boolean {
    return this.cmp(other) < 0;
  }

  lte(other: MoneyLike): boolean {
    return this.cmp(other) <= 0;
  }

  /**
   * Splits this amount by integer ratios without losing the smallest unit (0.0001).
   * The remainder goes to the earliest parts, one unit each, so the parts always add up to the total.
   */
  allocate(ratios: readonly number[]): Money[] {
    if (ratios.length === 0 || ratios.some((r) => !Number.isInteger(r) || r < 0)) {
      throw new RangeError('Ratios must be non-negative integers.');
    }
    const totalRatio = ratios.reduce((a, b) => a + b, 0);
    if (totalRatio === 0) throw new RangeError('At least one ratio must be positive.');
    const unit = new D('0.0001');
    const negative = this.value.isNegative();
    const absTotal = this.value.abs();
    const totalUnits = absTotal.div(unit);
    const shares = ratios.map((r) => totalUnits.times(r).div(totalRatio).floor());
    let remainder = totalUnits.minus(shares.reduce((a, b) => a.plus(b), new D(0)));
    return shares.map((share, index) => {
      let units = share;
      if (remainder.gt(0) && (ratios[index] ?? 0) > 0) {
        units = units.plus(1);
        remainder = remainder.minus(1);
      }
      const amount = units.times(unit);
      return new Money(negative ? amount.negated() : amount);
    });
  }

  /** Text for the database numeric(18,4) column, always four decimal places. */
  toDbString(): string {
    return this.value.toFixed(MONEY_SCALE);
  }

  toString(): string {
    return this.toDbString();
  }

  toJSON(): string {
    return this.toDbString();
  }

  /** Splits the value into sign, integer digits and fraction digits for display formatting. */
  toParts(places: number = MONEY_SCALE): { negative: boolean; integer: string; fraction: string } {
    const fixed = this.value.abs().toFixed(places);
    const [integer = '0', fraction = ''] = fixed.split('.');
    return { negative: this.isNegative(), integer, fraction };
  }
}
