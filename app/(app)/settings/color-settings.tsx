"use client";

import { useState } from "react";
import { Palette, TrendingUpDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ColorTheme } from "@/lib/color-theme";
import type { PnlColors } from "@/lib/pnl-colors";
import { ColorThemePicker } from "./color-theme-picker";
import { PnlColorPicker } from "./pnl-color-picker";

/** Farbschema und Gewinn-/Verlustfarben – gemeinsam, damit die Akzentfarbe die aktuelle Wahl für Gewinn/Verlust kennt. */
export function ColorSettings({ initialTheme, initialPnl }: { initialTheme: ColorTheme; initialPnl: PnlColors }) {
  const [pnl, setPnl] = useState(initialPnl);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-4" aria-hidden /> Farbschema
          </CardTitle>
          <CardDescription>Eine Vorgabe wählen oder zwei eigene Farben – die übrigen Töne für Hell und Dunkel werden daraus abgeleitet.</CardDescription>
        </CardHeader>
        <CardContent>
          <ColorThemePicker initial={initialTheme} pnl={pnl} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUpDown className="size-4" aria-hidden /> Gewinn &amp; Verlust
          </CardTitle>
          <CardDescription>Klassisch Grün und Rot, ein Paar für Rot-Grün-Schwäche oder zwei eigene Farben.</CardDescription>
        </CardHeader>
        <CardContent>
          <PnlColorPicker value={pnl} onChange={setPnl} />
        </CardContent>
      </Card>
    </>
  );
}
