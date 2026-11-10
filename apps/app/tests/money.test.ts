import {expect,test} from "bun:test";
import {formatMoney} from "../src/i18n/money";
import {setLocale} from "../src/i18n";

test("money follows app language and converts both billing currencies",()=>{
 expect(formatMoney("0.0571","USD","zh")).toBe("¥0.3997");
 expect(formatMoney("0.30","CNY","zh")).toBe("¥0.30");
 expect(formatMoney("0.30","CNY","en")).toBe("$0.042857");
 expect(formatMoney("0.0571","USD","en")).toBe("$0.0571");
 expect(formatMoney(-7,"CNY","en")).toBe("-$1.00");
 expect(formatMoney(0,"USD","zh")).toBe("¥0.00");
 expect(formatMoney(0.000001,"USD","zh")).toBe("¥0.000007");
 setLocale("zh");expect(formatMoney(1,"USD")).toBe("¥7.00");
 setLocale("en");expect(formatMoney(7,"CNY")).toBe("$1.00");
});
test("invalid amounts and unknown currencies are not mislabeled as money",()=>{
 for(const amount of ["", "oops", "Infinity", Number.NaN, Number.POSITIVE_INFINITY]) expect(formatMoney(amount,"USD","zh")).toBe("—");
 expect(formatMoney(1,"EUR","en")).toBe("—");
});
