
import { useEffect, useState } from "react";
import { parseUserTime } from "./parseUserTime";


export function TimeSelect({
  id = "selectTime",
  label = "Select time",
  value,
  onChange,
  error,
  invalidMessage = 'Enter a time like "1:30 PM" or "13:30"',
  disabled = false
}) {
  // controlled display value (human readable like "1:30 PM")
  const times = [];
  const popoverId = `${id}-popover`;
  // build times list once
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hour24 = h.toString().padStart(2, "0");
      const minute = m.toString().padStart(2, "0");
      const value24 = `${hour24}:${minute}`;
      const suffix = h >= 12 ? "PM" : "AM";
      const hour12 = ((h + 11) % 12) + 1;
      const label12 = `${hour12}:${minute} ${suffix}`;
      times.push({ value: value24, label: label12 });
    }
  }

  const labelFor = (hhmm) => {
    if (!hhmm) return "";
    const hit = times.find((t) => t.value === hhmm);
    if (hit) return hit.label;
    const [H, M] = hhmm.split(":").map((n) => parseInt(n, 10));
    const am = H < 12;
    const h12 = ((H + 11) % 12) + 1;
    return `${h12}:${String(M).padStart(2, "0")} ${am ? "AM" : "PM"}`;
  };

  // local display state so we can show the friendly label while remaining controlled
  const [display, setDisplay] = useState(value ? labelFor(value) : "");
  useEffect(() => {
    
    // sync whenever parent value changes (including when validation sets an error)
    setDisplay(value ? labelFor(value) : "");
  }, [value]);

  const openPopover = (el) => {
    if (disabled) return;
    el?.querySelector(`#${popoverId}Trigger`)?.click();
  }

  const commitFromField = (raw) => {
    if (disabled) return;
    const parsed = parseUserTime(raw);
    if (!parsed) {
      // notify parent by passing null / empty so parent can set error string
      onChange("");
      return;
    }
    onChange(parsed);
    setDisplay(labelFor(parsed));
  };

  return (
    <div>
      {/* This section is what will visually display when the function is called */}
      <s-text-field
        label={label}
        id={`${id}-input`}
        icon="clock"
        value={display}
        placeholder="Choose a time"
        error={error}
        disabled={disabled}
        onFocus={(e) => openPopover(e.currentTarget.parentElement)}
        onClick={(e) => openPopover(e.currentTarget.parentElement)}
        onInput={(e) => {
          if (disabled) return;
          setDisplay(e.currentTarget.value);
        }}
        onBlur={(e) => commitFromField(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === "Enter") {
            e.preventDefault();
            commitFromField(e.currentTarget.value);
          }
        }}
      >
        <s-button
          slot="accessory"
          variant="tertiary"
          disclosure="down"
          commandFor={popoverId}
          icon="chevron-down"
          accessibilityLabel="Select time"
          disabled={disabled}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
      </s-text-field>

      {/* This is the popover styling and the button population */}
      <s-popover id={popoverId} maxBlockSize="200px">
        <s-stack direction="block">
          {times.map((t) => (
            <s-button
              key={t.value}
              fullWidth
              variant="tertiary"
              commandFor={popoverId}
              disabled={disabled}
              onClick={() => {
                if (disabled) return;
                onChange(t.value);
                setDisplay(labelFor(t.value));
              }}
            >
              {t.label}
            </s-button>
          ))}
        </s-stack>
      </s-popover>
    </div>
  );
}