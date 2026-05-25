'use client'

import * as React from 'react'
import { Bar, BarChart, XAxis, YAxis, ResponsiveContainer, Cell } from 'recharts'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CreditTransaction } from '@/lib/types'
import { format, subDays, isSameDay } from 'date-fns'
import { ArrowUpRight } from 'lucide-react'

interface UsageChartProps {
    transactions: CreditTransaction[]
}

export function UsageChart({ transactions }: UsageChartProps) {
    const [timeRange, setTimeRange] = React.useState('14d')

    const chartData = React.useMemo(() => {
        const days = parseInt(timeRange) || 14
        const data = []
        const now = new Date()

        for (let i = days - 1; i >= 0; i--) {
            const date = subDays(now, i)
            const dayStr = format(date, 'MMM dd')

            // Filter usage transactions for this day
            const dayUsage = transactions
                .filter(tx => tx.amount < 0 && isSameDay(new Date(tx.created_at), date))
                .reduce((sum, tx) => sum + Math.abs(tx.amount), 0)

            data.push({
                date: dayStr,
                usage: dayUsage,
                fullDate: format(date, 'MMM dd, yyyy')
            })
        }
        return data
    }, [transactions, timeRange])

    const totalUsage = React.useMemo(() => {
        return chartData.reduce((sum, item) => sum + item.usage, 0)
    }, [chartData])

    const chartConfig = {
        usage: {
            label: 'Credits used',
            color: 'hsl(var(--primary))',
        },
    }

    const maxUsage = Math.max(...chartData.map(d => d.usage), 1)

    return (
        <Card className="border-none shadow-none bg-transparent">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-7 px-0">
                <div className="space-y-1">
                    <CardDescription className="text-[13px] font-medium text-muted-foreground/80">
                        Đã dùng ({timeRange === '7d' ? '7 ngày qua' : timeRange === '14d' ? '14 ngày qua' : '30 ngày qua'})
                    </CardDescription>
                    <div className="flex flex-col gap-1">
                        <CardTitle className="text-4xl font-bold tracking-tight text-foreground">
                            {totalUsage.toLocaleString('vi-VN')} <span className="text-lg font-normal text-muted-foreground/60">credits</span>
                        </CardTitle>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-lg border border-border/50">
                        <span className="text-[11px] font-medium text-muted-foreground px-2">Thời gian</span>
                        <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="w-[110px] h-7 border-none bg-background shadow-sm rounded-md text-[11px] font-medium">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-border/50 shadow-xl">
                                <SelectItem value="7d" className="text-xs">7 ngày qua</SelectItem>
                                <SelectItem value="14d" className="text-xs">14 ngày qua</SelectItem>
                                <SelectItem value="30d" className="text-xs">30 ngày qua</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="bg-muted/30 p-1 rounded-lg border border-border/50">
                        <div className="bg-background shadow-sm rounded-md px-2.5 py-1 text-[11px] font-bold text-foreground">
                            1d
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-0">
                <div className="relative h-[300px] w-full">
                    {/* Background Reference Line */}
                    <div
                        className="absolute w-full border-t border-dashed border-primary/30 z-0"
                        style={{ top: '30%', pointerEvents: 'none' }}
                    >
                        <span className="absolute -top-5 left-0 text-[10px] font-bold text-primary/60">
                            {(maxUsage * 0.7).toFixed(0)}
                        </span>
                    </div>

                    <ChartContainer config={chartConfig} className="h-full w-full">
                        <BarChart
                            data={chartData}
                            margin={{
                                top: 20,
                                right: 0,
                                left: 0,
                                bottom: 0,
                            }}
                            barGap={8}
                        >
                            <XAxis
                                dataKey="date"
                                axisLine={false}
                                tickLine={false}
                                tickMargin={15}
                                minTickGap={32}
                                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11, fontWeight: 500 }}
                            />
                            <YAxis hide domain={[0, maxUsage * 1.2]} />
                            <ChartTooltip
                                cursor={{ fill: 'rgba(255, 255, 255, 0.05)' }}
                                content={
                                    <ChartTooltipContent
                                        className="w-[180px] bg-card/90 backdrop-blur-md border-border shadow-2xl rounded-xl"
                                        nameKey="usage"
                                        labelFormatter={(value, payload) => {
                                            return (
                                                <div className="text-[11px] font-bold text-foreground mb-1">
                                                    {payload[0]?.payload?.fullDate || value}
                                                </div>
                                            )
                                        }}
                                        formatter={(value) => (
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-primary" />
                                                    <span className="text-[11px] text-muted-foreground">tổng</span>
                                                </div>
                                                <span className="text-[11px] font-bold">{value.toLocaleString()} credits</span>
                                            </div>
                                        )}
                                    />
                                }
                            />
                            <Bar
                                dataKey="usage"
                                fill="var(--color-usage)"
                                radius={[2, 2, 0, 0]}
                                barSize={40}
                            >
                                {chartData.map((entry, index) => (
                                    <Cell
                                        key={`cell-${index}`}
                                        fill={entry.usage > 0 ? '#8b5cf6' : 'rgba(255,255,255,0.05)'}
                                        className="transition-all duration-300"
                                    />
                                ))}
                            </Bar>
                        </BarChart>
                    </ChartContainer>
                </div>
            </CardContent>
        </Card>
    )
}
