import type { SupportedLanguage } from './languages'

export type ConsentStatus = 'age_unconfirmed' | 'pending' | 'received' | 'not_required'
export type ConsentSummary = { status: ConsentStatus; consented_at: string | null; language: string | null }
export const consentStatusLabels: Record<ConsentStatus, string> = { age_unconfirmed: '연령 확인 필요', pending: '동의 대기', received: '동의 접수', not_required: '14세 미만 아님' }
export type ConsentStudent = { id: string; name: string; is_under_14?: boolean | null; guardian: { language: string } | null; consent?: ConsentSummary }
type Receipt = { language: string; consented_at: string }
type Evidence = { guardian_id: string | null; program_id: string | null; guardian_phone: string; records: Receipt[] | Receipt | null }
export function summarizeConsent(student: { is_under_14?: boolean | null; guardian_id: string | null; program_id: string; guardian: { phone?: string } | { phone?: string }[] | null; consent_requests?: Evidence[] }): ConsentSummary {
  const guardian = Array.isArray(student.guardian) ? student.guardian[0] : student.guardian
  const receipts = (student.consent_requests ?? []).filter(request => student.guardian_id && request.guardian_id === student.guardian_id && request.program_id === student.program_id && request.guardian_phone === guardian?.phone)
    .flatMap(request => request.records ? Array.isArray(request.records) ? request.records : [request.records] : []).filter(receipt => Number.isFinite(Date.parse(receipt.consented_at)))
    .sort((a, b) => Date.parse(b.consented_at) - Date.parse(a.consented_at))
  const latest = receipts[0]
  // Link expiration/revocation is not withdrawal of an already recorded consent.
  const status = student.is_under_14 == null ? 'age_unconfirmed' : !student.is_under_14 ? 'not_required' : latest ? 'received' : 'pending'
  return { status, consented_at: latest?.consented_at ?? null, language: latest?.language ?? null }
}
export type ConsentCopy = {
  title: string; loading: string; document: string; korean: string; signer: string; representative: string; agree: string;
  submit: string; saving: string; received: string; receivedNote: string; date: string; expires: string;
  unavailable: string; unavailableNote: string; problem: string; retry: string; required: string; failure: string;
}
export const consentCopy: Record<SupportedLanguage, ConsentCopy> = {
  ko: { title: '보호자 동의', loading: '동의서를 불러오고 있습니다.', document: '동의 내용', korean: '한국어 안내', signer: '보호자 이름', representative: '저는 이 학생의 법정대리인입니다.', agree: '위 내용을 읽었으며 동의합니다.', submit: '동의하고 제출하기', saving: '저장 중…', received: '동의가 접수되었습니다', receivedNote: '담당자가 동의 기록을 확인할 수 있습니다. 이 창을 닫으셔도 됩니다.', date: '동의 일시', expires: '링크 만료일', unavailable: '이 링크를 사용할 수 없습니다', unavailableNote: '담당자에게 새 동의 링크를 요청해 주세요.', problem: '연결을 확인해 주세요', retry: '다시 확인', required: '이름과 두 확인 항목을 모두 작성해 주세요.', failure: '저장 결과를 확인하지 못했습니다. 다시 확인하면 이미 접수된 동의 여부를 확인할 수 있습니다.' },
  en: { title: 'Parent or guardian consent', loading: 'Loading the consent form.', document: 'Consent information', korean: 'Korean version', signer: 'Parent or guardian name', representative: 'I am this student’s legal representative.', agree: 'I have read the information above and agree to it.', submit: 'Agree and submit', saving: 'Saving…', received: 'Your consent has been received', receivedNote: 'The program staff can now see your consent record. You may close this window.', date: 'Consent date and time', expires: 'Link expires on', unavailable: 'This link is no longer available', unavailableNote: 'Please ask the program staff for a new consent link.', problem: 'Please check your connection', retry: 'Check again', required: 'Please enter your name and select both checkboxes.', failure: 'We could not confirm whether your consent was saved. Check again to see whether it has already been received.' },
  vi: { title: 'Sự đồng ý của phụ huynh', loading: 'Đang tải phiếu đồng ý.', document: 'Nội dung đồng ý', korean: 'Bản tiếng Hàn', signer: 'Họ tên phụ huynh hoặc người giám hộ', representative: 'Tôi là người đại diện theo pháp luật của học sinh này.', agree: 'Tôi đã đọc và đồng ý với nội dung trên.', submit: 'Đồng ý và gửi', saving: 'Đang lưu…', received: 'Đã tiếp nhận sự đồng ý của bạn', receivedNote: 'Người phụ trách có thể xem bản ghi đồng ý. Bạn có thể đóng cửa sổ này.', date: 'Ngày giờ đồng ý', expires: 'Liên kết hết hạn vào', unavailable: 'Không thể sử dụng liên kết này', unavailableNote: 'Vui lòng yêu cầu người phụ trách gửi liên kết mới.', problem: 'Vui lòng kiểm tra kết nối', retry: 'Kiểm tra lại', required: 'Vui lòng nhập họ tên và đánh dấu cả hai ô xác nhận.', failure: 'Chưa thể xác nhận nội dung đã được lưu. Hãy kiểm tra lại để biết sự đồng ý đã được tiếp nhận hay chưa.' },
  'zh-CN': { title: '家长或监护人同意', loading: '正在加载同意书。', document: '同意内容', korean: '韩语版本', signer: '家长或监护人姓名', representative: '我是该学生的法定代理人。', agree: '我已阅读并同意以上内容。', submit: '同意并提交', saving: '正在保存…', received: '已收到您的同意', receivedNote: '项目负责人可以查看同意记录。您可以关闭此窗口。', date: '同意日期和时间', expires: '链接到期时间', unavailable: '此链接已无法使用', unavailableNote: '请向项目负责人索取新的同意链接。', problem: '请检查网络连接', retry: '重新确认', required: '请输入姓名并勾选两个确认项。', failure: '暂时无法确认是否保存成功。请重新确认您的同意是否已被接收。' },
}
