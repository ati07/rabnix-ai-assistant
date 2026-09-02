"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Country dial-code picker + national number field that emits a single E.164
 * string (e.g. "+919876543210") via `onChange`. The parent only cares about the
 * combined value; country + digits are kept as local state here.
 *
 * The country list is curated (not exhaustive) — the markets we actually serve,
 * India first. Add rows as needed.
 */
type Country = { iso: string; name: string; dial: string; flag: string };

const COUNTRIES: Country[] = [
  { iso: "IN", name: "India", dial: "91", flag: "🇮🇳" },
  { iso: "US", name: "United States", dial: "1", flag: "🇺🇸" },
  { iso: "GB", name: "United Kingdom", dial: "44", flag: "🇬🇧" },
  { iso: "AE", name: "United Arab Emirates", dial: "971", flag: "🇦🇪" },
  { iso: "SA", name: "Saudi Arabia", dial: "966", flag: "🇸🇦" },
  { iso: "SG", name: "Singapore", dial: "65", flag: "🇸🇬" },
  { iso: "AU", name: "Australia", dial: "61", flag: "🇦🇺" },
  { iso: "CA", name: "Canada", dial: "1", flag: "🇨🇦" },
  { iso: "PK", name: "Pakistan", dial: "92", flag: "🇵🇰" },
  { iso: "BD", name: "Bangladesh", dial: "880", flag: "🇧🇩" },
  { iso: "NP", name: "Nepal", dial: "977", flag: "🇳🇵" },
  { iso: "LK", name: "Sri Lanka", dial: "94", flag: "🇱🇰" },
  { iso: "MY", name: "Malaysia", dial: "60", flag: "🇲🇾" },
  { iso: "ID", name: "Indonesia", dial: "62", flag: "🇮🇩" },
  { iso: "PH", name: "Philippines", dial: "63", flag: "🇵🇭" },
  { iso: "ZA", name: "South Africa", dial: "27", flag: "🇿🇦" },
  { iso: "NG", name: "Nigeria", dial: "234", flag: "🇳🇬" },
  { iso: "DE", name: "Germany", dial: "49", flag: "🇩🇪" },
  { iso: "FR", name: "France", dial: "33", flag: "🇫🇷" },
];

export function PhoneInput({
  id,
  required,
  disabled,
  onChange,
}: {
  id?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (e164: string) => void;
}) {
  const [iso, setIso] = useState("IN");
  const [digits, setDigits] = useState("");

  const country = COUNTRIES.find((c) => c.iso === iso) ?? COUNTRIES[0];

  function emit(dial: string, national: string) {
    onChange(national ? `+${dial}${national}` : "");
  }

  function onCountryChange(nextIso: string) {
    setIso(nextIso);
    const next = COUNTRIES.find((c) => c.iso === nextIso) ?? COUNTRIES[0];
    emit(next.dial, digits);
  }

  function onDigitsChange(raw: string) {
    // Keep digits only; drop spaces, dashes, a pasted leading "+" or dial code.
    const clean = raw.replace(/\D/g, "");
    setDigits(clean);
    emit(country.dial, clean);
  }

  return (
    <div className="flex gap-2">
      <Select value={iso} onValueChange={onCountryChange} disabled={disabled}>
        <SelectTrigger
          className="h-10 w-[7.25rem] shrink-0 text-sm"
          aria-label="Country calling code"
        >
          <SelectValue>
            <span className="flex items-center gap-1.5">
              <span className="text-base leading-none">{country.flag}</span>
              <span className="text-muted-foreground">+{country.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.iso}>
              <span className="flex items-center gap-2">
                <span className="text-base leading-none">{c.flag}</span>
                <span>{c.name}</span>
                <span className="text-muted-foreground">+{c.dial}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        required={required}
        disabled={disabled}
        autoComplete="tel-national"
        value={digits}
        onChange={(e) => onDigitsChange(e.target.value)}
        placeholder="98765 43210"
        className="h-10 flex-1 text-sm"
      />
    </div>
  );
}
