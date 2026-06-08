"use client"

import * as React from "react"
import { format } from "date-fns"
import { CalendarIcon } from "lucide-react"
import type { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

function DatePicker({
  date,
  onDateChange,
  placeholder = "Pick a date",
  className,
  disabled,
  formatStr = "PPP",
  ...calendarProps
}: {
  date?: Date
  onDateChange?: (date: Date | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  formatStr?: string
} & Omit<
  React.ComponentProps<typeof Calendar>,
  "mode" | "selected" | "onSelect"
>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          data-empty={!date}
          className={cn(
            "w-[280px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
            className
          )}
        >
          <CalendarIcon />
          {date ? format(date, formatStr) : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          onSelect={onDateChange}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  )
}

function DateRangePicker({
  dateRange,
  onDateRangeChange,
  placeholder = "Pick a date range",
  className,
  disabled,
  formatStr = "LLL dd, y",
  numberOfMonths = 2,
  ...calendarProps
}: {
  dateRange?: DateRange
  onDateRangeChange?: (range: DateRange | undefined) => void
  placeholder?: string
  className?: string
  disabled?: boolean
  formatStr?: string
} & Omit<
  React.ComponentProps<typeof Calendar>,
  "mode" | "selected" | "onSelect"
>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          data-empty={!dateRange?.from}
          className={cn(
            "w-[300px] justify-start text-left font-normal data-[empty=true]:text-muted-foreground",
            className
          )}
        >
          <CalendarIcon />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, formatStr)} -{" "}
                {format(dateRange.to, formatStr)}
              </>
            ) : (
              format(dateRange.from, formatStr)
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onDateRangeChange}
          numberOfMonths={numberOfMonths}
          {...calendarProps}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker, DateRangePicker }
