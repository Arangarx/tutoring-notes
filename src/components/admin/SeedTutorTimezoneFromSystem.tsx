"use client";

import { useEffect } from "react";
import { ensureTutorTimezoneFromSystem } from "@/app/admin/settings/billing/actions";
import { readBrowserTimeZone } from "@/lib/time/system-timezone";

/** Seeds AdminUser.tutorTimezone from this device when the override is still unset. */
export function SeedTutorTimezoneFromSystem() {
  useEffect(() => {
    const zone = readBrowserTimeZone();
    if (!zone) return;
    void ensureTutorTimezoneFromSystem(zone);
  }, []);
  return null;
}
