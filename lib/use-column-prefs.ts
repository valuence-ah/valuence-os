"use client";
// ─── useColumnPrefs ───────────────────────────────────────────────────────────
// Persistent per-user column preferences (width, order, hidden) backed by
// Supabase. Works optimistically — local state updates immediately, DB writes
// are debounced 800ms to avoid write-per-pixel during drag-resize.

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

export interface ColumnPrefs {
  columnWidths:   Record<string, number>;
  columnOrder:    string[];
  hiddenColumns:  string[];
}

interface UseColumnPrefsReturn extends ColumnPrefs {
  isLoading:          boolean;
  setColumnWidth:     (colName: string, width: number) => void;
  setColumnOrder:     (order: string[]) => void;
  toggleHiddenColumn: (colName: string) => void;
}

export function useColumnPrefs(tableKey: string): UseColumnPrefsReturn {
  const [isLoading, setIsLoading]   = useState(true);
  const [prefs, setPrefs]           = useState<ColumnPrefs>({
    columnWidths:  {},
    columnOrder:   [],
    hiddenColumns: [],
  });

  // Debounce timer for DB writes
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track the latest prefs to flush in the debounced save
  const latestPrefs = useRef<ColumnPrefs>(prefs);
  latestPrefs.current = prefs;

  // ── Load prefs on mount ───────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) { setIsLoading(false); return; }

      const { data } = await supabase
        .from("user_column_preferences")
        .select("column_widths, column_order, hidden_columns")
        .eq("user_id", session.user.id)
        .eq("table_key", tableKey)
        .maybeSingle();

      if (cancelled) return;

      if (data) {
        setPrefs({
          columnWidths:  (data.column_widths  as Record<string, number>) ?? {},
          columnOrder:   (data.column_order   as string[])               ?? [],
          hiddenColumns: (data.hidden_columns as string[])               ?? [],
        });
      }
      setIsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [tableKey]);

  // ── Debounced DB save ─────────────────────────────────────────────────────
  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const p = latestPrefs.current;
      await supabase
        .from("user_column_preferences")
        .upsert({
          user_id:        session.user.id,
          table_key:      tableKey,
          column_widths:  p.columnWidths,
          column_order:   p.columnOrder,
          hidden_columns: p.hiddenColumns,
          updated_at:     new Date().toISOString(),
        }, { onConflict: "user_id,table_key" });
    }, 800);
  }, [tableKey]);

  // ── Public mutators ───────────────────────────────────────────────────────

  const setColumnWidth = useCallback((colName: string, width: number) => {
    const clamped = Math.max(60, Math.min(500, width));
    setPrefs(prev => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [colName]: clamped },
    }));
    scheduleSave();
  }, [scheduleSave]);

  const setColumnOrder = useCallback((order: string[]) => {
    setPrefs(prev => ({ ...prev, columnOrder: order }));
    scheduleSave();
  }, [scheduleSave]);

  const toggleHiddenColumn = useCallback((colName: string) => {
    setPrefs(prev => {
      const hidden = prev.hiddenColumns.includes(colName)
        ? prev.hiddenColumns.filter(c => c !== colName)
        : [...prev.hiddenColumns, colName];
      return { ...prev, hiddenColumns: hidden };
    });
    scheduleSave();
  }, [scheduleSave]);

  return {
    ...prefs,
    isLoading,
    setColumnWidth,
    setColumnOrder,
    toggleHiddenColumn,
  };
}

// ── useColumnResize ───────────────────────────────────────────────────────────
// Attach to a column header's resize handle (the 4px-wide right-edge div).
// Returns an onMouseDown handler that tracks the drag and calls setColumnWidth.

export function useColumnResize(
  colName: string,
  currentWidth: number,
  setColumnWidth: (colName: string, width: number) => void,
) {
  return useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX     = e.clientX;
    const startWidth = currentWidth;

    function onMove(ev: MouseEvent) {
      const newWidth = Math.max(60, Math.min(500, startWidth + (ev.clientX - startX)));
      setColumnWidth(colName, newWidth);
    }

    function onUp() {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    }

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [colName, currentWidth, setColumnWidth]);
}
