export type NotificationView = { id: string; status: string; recipient: string; status_code: string | null; created_at: string; updated_at: string }
export const notificationLabels: Record<string, string> = {
  sending: '발송 요청 중', accepted: '접수 완료 · 도착 확인 전', delivered: '도착 확인', failed: '발송 실패', unknown: '결과 확인 필요',
}
export const notificationMessages: Record<string, string> = {
  sending: '알림톡을 요청하고 있습니다.', accepted: '알림톡 발송이 접수되었습니다. 잠시 후 도착 여부를 확인해 주세요.',
  delivered: '알림톡 도착을 확인했습니다.', failed: '알림톡을 보내지 못했습니다. 보호자 연락처와 모아킷 발송 설정을 확인해 주세요.',
  unknown: '발송 여부를 확실히 확인하지 못했습니다. 중복으로 보내지 않도록 재발송을 보류합니다.',
}
