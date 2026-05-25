'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
    ArrowLeft,
    Coins,
    Calendar,
    ArrowDownRight,
    ArrowUpRight,
    History,
    FileText,
    Hash,
    Wallet,
    Info
} from 'lucide-react'
import { createClient } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'react-toastify'
import { CreditTransaction } from '@/lib/credits/types'
import { UsageChart } from '@/components/credits/UsageChart'

const supabase = createClient()

// --- Mappings ---
const TYPE_MAP: Record<string, { label: string, icon: any }> = {
    purchase: { label: 'Nạp Credit', icon: ArrowDownRight },
    yearly_bonus: { label: 'Tặng kèm gói năm', icon: ArrowDownRight },
    usage: { label: 'Sử dụng AI', icon: ArrowUpRight },
    refund: { label: 'Hoàn tiền', icon: ArrowDownRight },
    admin_adjust: { label: 'Admin điều chỉnh', icon: Info },
}

// --- Utilities ---
const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('vi-VN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

const cleanDescription = (desc: string) => {
    if (!desc) return '';
    return desc.split(' — $')[0];
}

const getDocumentName = (desc: string) => {
    const cleaned = cleanDescription(desc);
    if (cleaned.startsWith('Xử lý tài liệu: ')) {
        let name = cleaned.replace('Xử lý tài liệu: ', '').trim();
        name = name.replace(' (Chat)', '');
        return name;
    }
    return null;
}

export default function CreditsHistoryPage() {
    const [loading, setLoading] = useState(true)
    const [transactions, setTransactions] = useState<CreditTransaction[]>([])
    const [selectedTx, setSelectedTx] = useState<any>(null)
    const [totalUsed, setTotalUsed] = useState<number>(0)
    const [viewMode, setViewMode] = useState<'chronological' | 'grouped'>('chronological')

    useEffect(() => {
        const fetchHistory = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                if (!user) return

                const { data: userCredits } = await supabase
                    .from('user_credits')
                    .select('total_used')
                    .eq('user_id', user.id)
                    .maybeSingle()

                if (userCredits) {
                    setTotalUsed(Number(userCredits.total_used))
                }

                const { data, error } = await supabase
                    .from('credit_transactions')
                    .select('*')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false })

                if (error) throw error

                setTransactions(data || [])
                if (data && data.length > 0) {
                    setSelectedTx(data[0])
                }
            } catch (err) {
                console.error('[CREDITS_HISTORY_ERROR]', err)
                toast.error('Không thể tải lịch sử giao dịch credit')
            } finally {
                setLoading(false)
            }
        }

        fetchHistory()
    }, [])

    const displayTransactions = useMemo(() => {
        if (viewMode === 'chronological') {
            return transactions.map(tx => ({ ...tx, isGroup: false }));
        }

        const groups: Record<string, any> = {};
        const others: any[] = [];

        transactions.forEach(tx => {
            const docName = getDocumentName(tx.description || '');
            if (docName) {
                if (!groups[docName]) {
                    groups[docName] = {
                        ...tx,
                        id: `group-${docName}`,
                        description: `Tài liệu: ${docName}`,
                        amount: 0,
                        transaction_type: 'usage',
                        isGroup: true,
                        subTransactions: []
                    };
                }
                groups[docName].amount += tx.amount;
                groups[docName].subTransactions.push(tx);
                // Keep the most recent date
                if (new Date(tx.created_at) > new Date(groups[docName].created_at)) {
                    groups[docName].created_at = tx.created_at;
                    groups[docName].balance_after = tx.balance_after;
                }
            } else {
                others.push({ ...tx, isGroup: false });
            }
        });

        return [...Object.values(groups), ...others].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }, [transactions, viewMode]);

    useEffect(() => {
        if (displayTransactions.length > 0 && (!selectedTx || !displayTransactions.find(t => t.id === selectedTx.id))) {
            setSelectedTx(displayTransactions[0])
        }
    }, [displayTransactions])

    if (loading) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                    <p className="text-muted-foreground animate-pulse">Đang tải lịch sử credit...</p>
                </div>
            </div>
        )
    }

    if (transactions.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 p-6">
                <div className="max-w-4xl mx-auto">
                    <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-8">
                        <ArrowLeft className="h-4 w-4" />
                        Quay lại hồ sơ
                    </Link>

                    <div className="flex flex-col items-center justify-center py-20 text-center bg-card border border-border rounded-3xl shadow-sm">
                        <div className="h-20 w-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                            <Coins className="h-10 w-10 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold mb-2">Chưa có biến động credit nào</h1>
                        <p className="text-muted-foreground max-w-md mb-8">
                            Bạn chưa có giao dịch cộng hoặc trừ credit nào. Hãy sử dụng AI để thấy lịch sử ở đây.
                        </p>
                        <Link href="/">
                            <Button size="lg" className="rounded-full px-8 gap-2">
                                Khám phá tính năng AI
                            </Button>
                        </Link>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pb-20">
            {/* Header Section */}
            <div className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div>
                            <Link href="/profile" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground transition mb-4 group">
                                <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                                Quay lại hồ sơ
                            </Link>
                            <h1 className="text-3xl font-bold text-foreground tracking-tight">Lịch sử Ví Credit</h1>
                            <p className="text-muted-foreground mt-1">Chi tiết các lần cộng trừ credit của bạn</p>
                        </div>

                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex items-center gap-4"
                        >
                            <div className="h-12 w-12 bg-primary/10 text-primary rounded-xl flex items-center justify-center shadow-sm">
                                <Coins className="h-6 w-6" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-muted-foreground">Tổng AI đã dùng</p>
                                <p className="text-2xl font-bold text-foreground">
                                    {totalUsed.toLocaleString('vi-VN')} <span className="text-sm font-normal text-muted-foreground">credit</span>
                                </p>
                            </div>
                        </motion.div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
                <div className="bg-card/30 border border-border rounded-3xl p-8 mb-10 shadow-sm backdrop-blur-sm">
                    <UsageChart transactions={transactions} />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left Panel: Transaction List */}
                    <div className="lg:col-span-5 space-y-4">
                        <div className="flex items-center justify-between px-2">
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <History className="h-5 w-5 text-primary" />
                                Lịch sử biến động
                            </h3>
                            <div className="flex bg-muted/50 p-1 rounded-xl w-fit">
                                <Button
                                    variant={viewMode === 'chronological' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('chronological')}
                                    className="rounded-lg h-7 px-3 text-xs"
                                >Chi tiết</Button>
                                <Button
                                    variant={viewMode === 'grouped' ? 'secondary' : 'ghost'}
                                    size="sm"
                                    onClick={() => setViewMode('grouped')}
                                    className="rounded-lg h-7 px-3 text-xs"
                                >Theo tài liệu</Button>
                            </div>
                        </div>
                        <ScrollArea className="h-[calc(100vh-280px)]">
                            <div className="space-y-3 p-1 pr-4">
                                {displayTransactions.map((tx) => {
                                    const typeInfo = TYPE_MAP[tx.transaction_type] || { label: tx.transaction_type, icon: Info }
                                    const TypeIcon = typeInfo.icon
                                    const isSelected = selectedTx?.id === tx.id
                                    const isPositive = tx.amount > 0

                                    return (
                                        <motion.div
                                            key={tx.id}
                                            whileHover={{ scale: 1.01 }}
                                            whileTap={{ scale: 0.99 }}
                                            onClick={() => setSelectedTx(tx)}
                                            className={`
                                                cursor-pointer p-4 rounded-2xl border transition-all duration-200
                                                ${isSelected
                                                    ? 'bg-card border-primary ring-1 ring-inset ring-primary shadow-md'
                                                    : 'bg-card border-border hover:border-primary/50 hover:shadow-sm'}
                                            `}
                                        >
                                            <div className="flex justify-between items-start mb-3">
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-2 rounded-xl ${isPositive ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                                        <TypeIcon className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <p className="font-bold text-foreground line-clamp-1">
                                                            {cleanDescription(tx.description || typeInfo.label)}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                                                            <Calendar className="h-3 w-3" />
                                                            {new Date(tx.created_at).toLocaleDateString('vi-VN')}
                                                            {tx.isGroup && ` • ${tx.subTransactions.length} lượt xử lý`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className={`text-sm font-bold tabular-nums whitespace-nowrap ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {isPositive ? '+' : ''}{tx.amount.toLocaleString('vi-VN')}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
                                                <Badge variant="secondary" className="bg-muted/50 text-xs font-normal">
                                                    {typeInfo.label}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    Số dư: {tx.balance_after.toLocaleString('vi-VN')}
                                                </span>
                                            </div>
                                        </motion.div>
                                    )
                                })}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right Panel: Transaction Details */}
                    <div className="lg:col-span-7">
                        <div className="sticky top-[120px]">
                            {selectedTx ? (
                                <Card className="border-border shadow-md rounded-3xl overflow-hidden">
                                    <div className={`h-2 ${selectedTx.amount > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                    <CardHeader className="pb-4">
                                        <CardDescription className="flex items-center justify-between">
                                            <span>Chi tiết giao dịch</span>
                                            <span className="flex items-center gap-1 text-xs">
                                                <Calendar className="h-3 w-3" />
                                                {formatDate(selectedTx.created_at)}
                                            </span>
                                        </CardDescription>
                                        <CardTitle className="text-2xl pt-2">
                                            {cleanDescription(selectedTx.description || (TYPE_MAP[selectedTx.transaction_type]?.label))}
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        {/* Amount Box */}
                                        <div className="bg-muted/30 rounded-2xl p-6 flex flex-col items-center justify-center border border-border/50">
                                            <p className="text-sm font-medium text-muted-foreground mb-2">Biến động</p>
                                            <div className="flex items-baseline gap-2">
                                                <span className={`text-5xl font-extrabold tracking-tight tabular-nums ${selectedTx.amount > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                                    {selectedTx.amount > 0 ? '+' : ''}{selectedTx.amount.toLocaleString('vi-VN')}
                                                </span>
                                                <span className="text-xl font-medium text-muted-foreground">credits</span>
                                            </div>
                                        </div>

                                        {/* Details Grid */}
                                        <div className="grid gap-4">
                                            <div className="flex justify-between items-center py-3 border-b border-border/50">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <Hash className="h-4 w-4" />
                                                    <span>{selectedTx.isGroup ? 'Mã nhóm' : 'Mã giao dịch'}</span>
                                                </div>
                                                <span className="font-mono text-sm">{selectedTx.id.split('-')[0]}...</span>
                                            </div>

                                            <div className="flex justify-between items-center py-3 border-b border-border/50">
                                                <div className="flex items-center gap-2 text-muted-foreground">
                                                    <FileText className="h-4 w-4" />
                                                    <span>Loại giao dịch</span>
                                                </div>
                                                <span className="font-medium">
                                                    {TYPE_MAP[selectedTx.transaction_type]?.label || selectedTx.transaction_type}
                                                </span>
                                            </div>

                                            {!selectedTx.isGroup && (
                                                <div className="flex justify-between items-center py-3 border-b border-border/50">
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <Wallet className="h-4 w-4" />
                                                        <span>Số dư sau GD</span>
                                                    </div>
                                                    <span className="font-bold text-foreground">
                                                        {selectedTx.balance_after.toLocaleString('vi-VN')} credits
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ) : (
                                <div className="h-[500px] flex items-center justify-center border border-dashed rounded-3xl text-muted-foreground bg-card/50">
                                    Chọn một giao dịch để xem chi tiết
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}