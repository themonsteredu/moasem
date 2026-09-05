import type { SupportedLanguage } from './languages'

// Operator decisions are deliberately unresolved. Never publish these placeholders.
export const consentTemplateLabel = '모아셈 학습관리 개인정보 동의서'
export function consentTemplate(): Record<SupportedLanguage, { title: string; body: string }> {
  return {
    ko: { title: '모아셈 수학 학습관리 개인정보 수집·이용 동의', body: `모아셈은 기관에서 운영하는 수학 학습 프로그램의 학생 기록과 보호자 안내를 돕는 서비스입니다. 아래 내용을 읽고 동의 여부를 선택해 주세요.

1. 개인정보를 처리하는 운영 주체
{{OPERATOR}}
문의 및 권리 행사: {{CONTACT}}

2. 수집·이용 목적
학생 등록과 프로그램 운영, 대면 수업 출석 관리, 교재 진도와 학습 결과·오답 기록 관리, 보호자 언어에 맞춘 학습 리포트 제공, 법정대리인 동의 확인 및 문의 처리.

3. 수집·이용 항목
학생: 이름, 학년, 소속 프로그램, 등록 시 부여한 학생 번호, 만 14세 미만 여부, 출석, 교재·단원·쪽수·과제, 학습 결과와 오답, 지도에 필요한 강사 기록.
보호자: 이름, 연락처, 안내 언어.
동의 확인: 동의자 이름, 법정대리인 확인 응답, 동의 여부·일시·언어, 당시 동의 문구.
학생 번호는 서비스 내 관리용 번호이며 주민등록번호는 수집하지 않습니다. 강사 기록에는 건강·장애·체류자격 등 민감한 정보를 적지 않습니다.

4. 보유·이용 기간
{{RETENTION}}
기간이 끝나거나 처리 목적이 달성되면 지체 없이 파기합니다. 법령에 따라 보존해야 하는 정보는 해당 근거와 기간을 별도로 안내하고 구분하여 보관합니다.

5. 동의 거부 및 철회
동의를 거부할 수 있습니다. 거부하면 개인정보 처리가 필요한 모아셈의 개인별 학습관리와 보호자 리포트 이용이 제한될 수 있습니다. 기관 프로그램 참여의 다른 방법은 담당자에게 문의해 주세요. 열람·정정·삭제·처리정지 또는 동의 철회는 위 연락처로 요청할 수 있습니다. 동의 링크의 만료는 이미 한 동의의 철회를 뜻하지 않습니다.

6. 처리 위탁·기관의 역할·국외 이전 안내
{{PROCESSING_NOTICE}}

7. 추가 서비스 안내
과제 사진 처리, AI 분석, 알림톡, Zoom 화상수업을 활성화할 때에는 실제 처리 항목과 위탁·제공·국외 이전 해당 사항을 먼저 안내하고, 필요한 경우 별도로 동의를 받습니다. 이 동의는 수업 녹화·홍보 활용·마케팅에 대한 동의를 포함하지 않습니다.

본인은 위 내용을 확인하였으며, 해당 학생의 법정대리인으로서 위 개인정보 수집·이용에 동의합니다.` },
    en: { title: 'Consent to collect and use personal information for MOASEM mathematics learning support', body: `MOASEM helps manage student learning records and guardian communications for institution-run mathematics programmes. Please read the following before choosing whether to consent.

1. Organisation responsible for processing personal information
{{OPERATOR}}
Contact for enquiries and privacy requests: {{CONTACT}}

2. Purposes
Student registration and programme administration; in-person attendance; textbook progress, learning results and error records; learning reports in the guardian’s preferred language; confirmation of legal guardian consent; and handling enquiries.

3. Information collected and used
Student: name, school grade, programme, assigned student reference number, whether the child is under 14, attendance, textbook/unit/pages/assignments, learning results and errors, and instructor notes necessary for teaching.
Guardian: name, contact number and preferred language.
Consent record: signatory name, legal guardian declaration, consent response, date and time, language, and the consent text shown at the time.
The student number is an internal reference, not a national identification number. Instructor notes must not contain sensitive information such as health, disability or immigration status.

4. Retention period
{{RETENTION}}
Information will be destroyed without delay when the retention period ends or its purpose is fulfilled. If retention is required by law, the applicable basis and period will be communicated separately and the information kept separately.

5. Refusal and withdrawal
You may refuse consent. This may limit access to individual learning management and guardian reports that require personal information. Ask the institution about alternative ways to participate in its programme. Use the contact above to request access, correction, deletion, restriction of processing or withdrawal of consent. Expiry of a consent link does not withdraw consent already given.

6. Service providers, the institution’s role and overseas transfers
{{PROCESSING_NOTICE}}

7. Additional services
Before enabling assignment photo processing, AI analysis, Kakao notifications or Zoom classes, we will explain the actual data processing and any applicable outsourcing, third-party disclosure or overseas transfer, and obtain separate consent where required. This consent does not cover class recording, publicity or marketing.

I have read the information above and, as the student’s legal guardian, consent to this collection and use of personal information.` },
    vi: { title: 'Đồng ý thu thập và sử dụng thông tin cá nhân để hỗ trợ học toán trên MOASEM', body: `MOASEM hỗ trợ quản lý hồ sơ học tập và cung cấp thông tin cho người giám hộ trong chương trình toán do đơn vị tổ chức. Vui lòng đọc nội dung sau trước khi quyết định đồng ý.

1. Đơn vị chịu trách nhiệm xử lý thông tin cá nhân
{{OPERATOR}}
Liên hệ để được giải đáp và thực hiện quyền về thông tin cá nhân: {{CONTACT}}

2. Mục đích
Đăng ký học sinh và vận hành chương trình; quản lý điểm danh lớp trực tiếp; theo dõi tiến độ sách, kết quả học tập và lỗi sai; cung cấp báo cáo bằng ngôn ngữ người giám hộ lựa chọn; xác nhận sự đồng ý của người đại diện theo pháp luật và giải đáp yêu cầu.

3. Thông tin thu thập và sử dụng
Học sinh: họ tên, khối lớp, chương trình, mã học sinh được cấp, tình trạng dưới 14 tuổi, điểm danh, sách/bài/trang/bài tập, kết quả học tập, lỗi sai và ghi chép cần thiết của giáo viên.
Người giám hộ: họ tên, số liên lạc và ngôn ngữ hướng dẫn.
Hồ sơ đồng ý: tên người đồng ý, xác nhận là người đại diện theo pháp luật, lựa chọn đồng ý, ngày giờ, ngôn ngữ và nội dung được hiển thị lúc đồng ý.
Mã học sinh chỉ dùng để quản lý nội bộ, không phải số định danh cá nhân. Giáo viên không ghi thông tin nhạy cảm như sức khỏe, khuyết tật hoặc tình trạng cư trú.

4. Thời hạn lưu giữ và sử dụng
{{RETENTION}}
Thông tin sẽ được hủy không chậm trễ khi hết thời hạn hoặc hoàn thành mục đích xử lý. Nếu pháp luật yêu cầu lưu giữ, căn cứ và thời hạn sẽ được thông báo riêng và thông tin được lưu riêng.

5. Từ chối và rút lại sự đồng ý
Quý vị có quyền từ chối. Việc này có thể hạn chế sử dụng tính năng quản lý học tập cá nhân và báo cáo cho người giám hộ cần xử lý thông tin cá nhân. Vui lòng hỏi đơn vị tổ chức về cách tham gia chương trình khác. Quý vị có thể liên hệ ở trên để yêu cầu xem, sửa, xóa, ngừng xử lý hoặc rút lại sự đồng ý. Liên kết hết hạn không có nghĩa là sự đồng ý đã được rút lại.

6. Đơn vị xử lý, vai trò của cơ quan tổ chức và chuyển thông tin ra nước ngoài
{{PROCESSING_NOTICE}}

7. Dịch vụ bổ sung
Trước khi bật xử lý ảnh bài tập, phân tích AI, thông báo Kakao hoặc lớp Zoom, chúng tôi sẽ thông báo thông tin thực tế được xử lý và việc ủy thác, cung cấp cho bên thứ ba hoặc chuyển ra nước ngoài nếu có, đồng thời xin sự đồng ý riêng khi cần. Sự đồng ý này không bao gồm ghi hình lớp học, quảng bá hoặc tiếp thị.

Tôi đã đọc nội dung trên và, với tư cách người đại diện theo pháp luật của học sinh, đồng ý việc thu thập và sử dụng thông tin cá nhân nêu trên.` },
    'zh-CN': { title: 'MOASEM数学学习管理个人信息收集与使用同意书', body: `MOASEM为机构开展的数学学习项目提供学生学习记录管理和监护人通知服务。请阅读以下内容后决定是否同意。

1. 个人信息处理负责单位
{{OPERATOR}}
咨询及个人信息权利申请联系方式：{{CONTACT}}

2. 收集与使用目的
学生登记和项目运营；线下课程出勤管理；教材进度、学习结果和错题记录管理；按监护人选择的语言提供学习报告；确认法定代理人同意及处理咨询。

3. 收集与使用的信息
学生：姓名、年级、所属项目、分配的学生编号、是否未满14周岁、出勤、教材/单元/页码/作业、学习结果、错题及教学所需的教师记录。
监护人：姓名、联系电话和通知语言。
同意记录：同意人姓名、法定代理人身份声明、同意选择、日期和时间、语言以及当时显示的同意书内容。
学生编号仅供服务内部管理，不收集居民身份证号码。教师记录不应包含健康、残疾或居留资格等敏感信息。

4. 保存与使用期限
{{RETENTION}}
保存期限届满或处理目的实现后，将及时销毁信息。依法必须保存的信息，将另行说明法律依据和保存期限，并分别保存。

5. 拒绝同意及撤回同意
您有权拒绝同意。拒绝后，可能无法使用需要处理个人信息的个别学习管理和监护人报告功能。有关机构项目的其他参与方式，请咨询负责人。您可通过上述联系方式申请查阅、更正、删除、停止处理或撤回同意。同意链接到期并不表示已作出的同意被撤回。

6. 委托处理、机构职责及境外传输说明
{{PROCESSING_NOTICE}}

7. 附加服务
启用作业照片处理、AI分析、Kakao通知或Zoom视频课程前，将说明实际处理的信息以及适用的委托处理、向第三方提供或向境外传输情况，并在需要时另行征得同意。本同意不包括课程录制、宣传或营销用途。

本人已阅读上述内容，并作为该学生的法定代理人，同意上述个人信息的收集与使用。` },
  }
}
export function hasConsentPlaceholders(text: string) { return /\{\{(?:OPERATOR|CONTACT|RETENTION|PROCESSING_NOTICE)\}\}/.test(text) }
