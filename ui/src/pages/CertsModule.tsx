import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchApi } from '../lib/api'
import { useAuthStore } from '../store/authStore'
import {
  Button,
  Dialog,
  Input,
  Select,
  EmptyState,
} from '../components/ui/primitives'
import {
  ShieldCheck,
  Plus,
  Trash2,
  Download,
  Copy,
  RotateCw,
  Ban,
  Check,
  FileKey,
  KeyRound,
  Eye,
} from 'lucide-react'
import { useToast } from '../components/ui/Toast'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'

export const CertsModule: React.FC = () => {
  const { currentWorkspace } = useAuthStore()
  const qc = useQueryClient()
  const { success, error: toastError } = useToast()

  const [issueOpen, setIssueOpen] = useState(false)
  const [caModalOpen, setCaModalOpen] = useState(false)
  const [viewCert, setViewCert] = useState<any | null>(null)
  const [createdCertResult, setCreatedCertResult] = useState<any | null>(null)
  const [deleteCertId, setDeleteCertId] = useState<string | null>(null)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const [issueForm, setIssueForm] = useState({
    entity_id: '',
    ttl: '8760h',
    ip_addresses: '',
  })

  // List certificates
  const { data: rawCerts, isLoading } = useQuery({
    queryKey: ['/api/certs', currentWorkspace?.id],
    queryFn: () => fetchApi<any>('/api/certs'),
    enabled: !!currentWorkspace?.id,
  })
  const certs: any[] = rawCerts?.items ?? []

  // Devices query to select entity
  const { data: rawDevices } = useQuery({
    queryKey: ['/api/devices', currentWorkspace?.id],
    queryFn: () => fetchApi<any>('/api/devices?limit=100'),
    enabled: !!currentWorkspace?.id,
  })
  const devices: any[] = rawDevices?.items ?? []

  // CA Cert Query
  const { data: caData } = useQuery({
    queryKey: ['/api/certs/view-ca'],
    queryFn: () => fetchApi<any>('/api/certs/view-ca'),
  })

  const issueMutation = useMutation({
    mutationFn: (payload: any) =>
      fetchApi(`/api/certs/issue/${payload.entity_id}`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['/api/certs'] })
      setIssueOpen(false)
      setIssueForm({ entity_id: '', ttl: '8760h', ip_addresses: '' })
      setCreatedCertResult(data)
      success(`设备「${data.entity_id}」证书签发成功`)
    },
    onError: (err: any) => toastError(err.message || '签发证书失败'),
  })

  const renewMutation = useMutation({
    mutationFn: ({ id, ttl }: { id: string; ttl: string }) =>
      fetchApi(`/api/certs/${id}/renew`, {
        method: 'PATCH',
        body: JSON.stringify({ ttl }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/certs'] })
      success('证书已成功续期')
    },
    onError: (err: any) => toastError(err.message || '续期失败'),
  })

  const revokeMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/certs/${id}/revoke`, {
        method: 'PATCH',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/certs'] })
      success('证书已吊销')
    },
    onError: (err: any) => toastError(err.message || '吊销失败'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetchApi(`/api/certs/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['/api/certs'] })
      setDeleteCertId(null)
      success('证书记录已删除')
    },
    onError: (err: any) => toastError(err.message || '删除证书失败'),
  })

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    setCopiedKey(label)
    setTimeout(() => setCopiedKey(null), 2000)
    success(`已复制 ${label} 到剪贴板`)
  }

  const downloadText = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const activeCount = certs.filter((c) => !c.revoked).length
  const revokedCount = certs.filter((c) => c.revoked).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <FileKey className="w-5 h-5 text-blue-600" />
            <span>X.509 设备证书与安全凭证管理 (mTLS PKI)</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            支持基于私有根 CA 签发标准 X.509 双向认证证书，提供设备 mTLS 身份凭证、证书续期与在线吊销
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setCaModalOpen(true)}
            className="flex items-center gap-1.5 text-xs text-slate-700 bg-white"
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>查看 / 下载 CA 根证书</span>
          </Button>
          <Button onClick={() => setIssueOpen(true)} className="flex items-center gap-1.5 text-xs">
            <Plus className="w-4 h-4" />
            <span>签发新证书</span>
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">已签发证书总数</div>
            <div className="text-2xl font-bold text-slate-800 mt-1">{certs.length}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <FileKey className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">有效运行中证书</div>
            <div className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">已吊销证书 (Revoked)</div>
            <div className="text-2xl font-bold text-rose-500 mt-1">{revokedCount}</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
            <Ban className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Certificates Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {isLoading ? (
          <EmptyState text="" loading />
        ) : certs.length === 0 ? (
          <EmptyState text="当前租户暂无已签发的设备证书，点击上方「签发新证书」为设备生成 mTLS 密钥" />
        ) : (
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 text-xs font-semibold uppercase tracking-wider">
                <th className="py-3 px-4">关联设备 / 实体 ID</th>
                <th className="py-3 px-4">证书序列号 (Serial)</th>
                <th className="py-3 px-4">签发时间</th>
                <th className="py-3 px-4">到期时间</th>
                <th className="py-3 px-4">状态</th>
                <th className="py-3 px-4 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {certs.map((c) => {
                const isExpired = c.expiry_time && c.expiry_time.startsWith("1970")
                return (
                  <tr key={c.id} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-mono font-medium text-blue-600">
                      {c.entity_id}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-500 truncate max-w-[140px]" title={c.serial_number}>
                      {c.serial_number}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span className={isExpired ? 'text-rose-600 font-semibold' : 'text-slate-600'}>
                        {new Date(c.expiry_time).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {c.revoked ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                          已吊销
                        </span>
                      ) : isExpired ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                          已过期
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                          有效
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setViewCert(c)}
                          title="查看证书内容"
                          className="text-slate-500 hover:text-blue-600"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        {!c.revoked && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => renewMutation.mutate({ id: c.id, ttl: '8760h' })}
                              title="续期 1 年"
                              className="text-slate-500 hover:text-emerald-600"
                            >
                              <RotateCw className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => revokeMutation.mutate(c.id)}
                              title="吊销证书"
                              className="text-slate-500 hover:text-amber-600"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </Button>
                          </>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteCertId(c.id)}
                          title="删除记录"
                          className="text-slate-500 hover:text-red-600"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Issue Cert Dialog */}
      <Dialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="签发 X.509 客户端证书"
        description="基于平台自签名根 CA 签发标准双向 TLS 认证证书与 ECDSA 密钥"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            const ips = issueForm.ip_addresses
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
            issueMutation.mutate({
              entity_id: issueForm.entity_id,
              ttl: issueForm.ttl,
              ip_addresses: ips,
            })
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              关联设备 / 实体 ID (CommonName) *
            </label>
            <div className="space-y-1">
              <Input
                required
                value={issueForm.entity_id}
                onChange={(e) => setIssueForm({ ...issueForm, entity_id: e.target.value })}
                placeholder="例如：dev-smart-meter-01"
              />
              {devices.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1 text-[11px] text-slate-500 items-center">
                  <span>从已有设备快捷选择:</span>
                  {devices.slice(0, 5).map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => setIssueForm({ ...issueForm, entity_id: d.id })}
                      className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-blue-50 text-blue-600 font-mono"
                    >
                      {d.id}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">有效时长 (TTL)</label>
              <Select
                value={issueForm.ttl}
                onChange={(e) => setIssueForm({ ...issueForm, ttl: e.target.value })}
              >
                <option value="720h">1 个月 (720h)</option>
                <option value="2160h">3 个月 (2160h)</option>
                <option value="8760h">1 年 (8760h - 推荐)</option>
                <option value="26280h">3 年 (26280h)</option>
                <option value="87600h">10 年 (87600h)</option>
              </Select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">SAN IP 绑定 (选填)</label>
              <Input
                value={issueForm.ip_addresses}
                onChange={(e) => setIssueForm({ ...issueForm, ip_addresses: e.target.value })}
                placeholder="192.168.1.100, 10.0.0.1"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setIssueOpen(false)}>
              取消
            </Button>
            <Button type="submit" loading={issueMutation.isPending}>
              确认签发
            </Button>
          </div>
        </form>
      </Dialog>

      {/* Newly Created Cert Result Modal */}
      <Dialog
        open={!!createdCertResult}
        onClose={() => setCreatedCertResult(null)}
        title="证书签发成功"
        description="请立即妥善保存客户端证书与私钥，私钥仅此一次完整显示"
      >
        <div className="space-y-4">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 space-y-1">
            <div className="font-bold">实体 ID: {createdCertResult?.entity_id}</div>
            <div>序列号: <span className="font-mono">{createdCertResult?.serial_number}</span></div>
            <div>到期时间: {new Date(createdCertResult?.expiry_time || '').toLocaleString()}</div>
          </div>

          {/* Client Certificate */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700">客户端证书 (client.crt)</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => copyToClipboard(createdCertResult?.certificate, '客户端证书')}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  {copiedKey === '客户端证书' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>复制</span>
                </button>
                <button
                  type="button"
                  onClick={() => downloadText(createdCertResult?.certificate, `${createdCertResult?.entity_id}.crt`)}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 .crt</span>
                </button>
              </div>
            </div>
            <textarea
              readOnly
              rows={5}
              value={createdCertResult?.certificate || ''}
              className="w-full text-[11px] font-mono bg-slate-900 text-slate-200 p-2.5 rounded-lg border border-slate-700 select-all"
            />
          </div>

          {/* Client Private Key */}
          {createdCertResult?.key && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                  <span>客户端私钥 (client.key)</span>
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(createdCertResult?.key, '客户端私钥')}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {copiedKey === '客户端私钥' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>复制</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadText(createdCertResult?.key, `${createdCertResult?.entity_id}.key`)}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>下载 .key</span>
                  </button>
                </div>
              </div>
              <textarea
                readOnly
                rows={5}
                value={createdCertResult?.key || ''}
                className="w-full text-[11px] font-mono bg-slate-900 text-amber-300 p-2.5 rounded-lg border border-slate-700 select-all"
              />
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={() => setCreatedCertResult(null)}>
              我已保存，关闭窗口
            </Button>
          </div>
        </div>
      </Dialog>

      {/* View Cert Detail Dialog */}
      <Dialog
        open={!!viewCert}
        onClose={() => setViewCert(null)}
        title="查看证书详情"
        description={`实体: ${viewCert?.entity_id} | 序列号: ${viewCert?.serial_number}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-xs p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div><span className="text-slate-400">签发日期:</span> {new Date(viewCert?.created_at || '').toLocaleString()}</div>
            <div><span className="text-slate-400">有效截止:</span> {new Date(viewCert?.expiry_time || '').toLocaleString()}</div>
            <div><span className="text-slate-400">状态:</span> {viewCert?.revoked ? '已吊销' : '有效'}</div>
            {viewCert?.revoked && <div><span className="text-slate-400">吊销日期:</span> {new Date(viewCert?.revoked_at || '').toLocaleString()}</div>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700">PEM 证书文本</span>
              <button
                type="button"
                onClick={() => copyToClipboard(viewCert?.certificate, '证书内容')}
                className="text-xs text-blue-600 hover:underline flex items-center gap-1"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>复制证书</span>
              </button>
            </div>
            <textarea
              readOnly
              rows={8}
              value={viewCert?.certificate || ''}
              className="w-full text-[11px] font-mono bg-slate-900 text-slate-200 p-2.5 rounded-lg border border-slate-700 select-all"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setViewCert(null)}>
              关闭
            </Button>
          </div>
        </div>
      </Dialog>

      {/* CA Root Certificate Modal */}
      <Dialog
        open={caModalOpen}
        onClose={() => setCaModalOpen(false)}
        title="平台根 CA 证书 (Root CA)"
        description="用于分发至物联网设备与网关，作为双向 TLS (mTLS) 通信时信任的根证书"
      >
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800">
            设备连接 MQTT mTLS (例如 FluxMQ 端口 8883) 时，需将此根证书配置为设备的 CA 信任文件 (`ca.crt`)。
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-slate-700">Root CA PEM</span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(caData?.ca_certificate || '', 'CA 根证书')}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制</span>
                </button>
                <a
                  href="/api/certs/download-ca"
                  download="ca.crt"
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>下载 ca.crt</span>
                </a>
              </div>
            </div>
            <textarea
              readOnly
              rows={10}
              value={caData?.ca_certificate || ''}
              className="w-full text-[11px] font-mono bg-slate-900 text-slate-200 p-2.5 rounded-lg border border-slate-700 select-all"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button onClick={() => setCaModalOpen(false)}>
              关闭
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Delete Confirm */}
      <ConfirmDialog
        open={!!deleteCertId}
        title="确认删除证书记录"
        message="确定要从后台彻底删除该证书记录吗？已部署至现场的设备将无法再在此列表中查看其元数据。"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteCertId) deleteMutation.mutate(deleteCertId)
        }}
        onClose={() => setDeleteCertId(null)}
      />
    </div>
  )
}
