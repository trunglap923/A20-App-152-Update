import type { ProcessedContent, UploadedFile } from './types'

export const mockHistory: UploadedFile[] = [
  {
    id: '1',
    name: 'Cơ bản Học máy.pdf',
    type: 'pdf',
    uploadedAt: new Date('2024-01-15'),
    status: 'done',
  },
  {
    id: '2',
    name: 'Ghi âm Phỏng vấn.mp3',
    type: 'audio',
    uploadedAt: new Date('2024-01-14'),
    status: 'done',
  },
  {
    id: '3',
    name: 'Workshop Thiết kế Sản phẩm',
    type: 'youtube',
    uploadedAt: new Date('2024-01-12'),
    status: 'done',
  },
]

export const mockContent: ProcessedContent = {
  summary: {
    tldr: [
      'Học máy cho phép máy tính học từ dữ liệu mà không cần lập trình tường minh',
      'Ba loại chính: học có giám sát, không giám sát và học tăng cường',
      'Mạng nơ-ron được lấy cảm hứng từ các cấu trúc của não sinh học',
      'Học sâu sử dụng nhiều lớp để trích xuất các đặc trưng bậc cao hơn',
      'Ứng dụng từ nhận dạng hình ảnh đến xử lý ngôn ngữ tự nhiên',
    ],
    detailed: `Học máy là một tập hợp con của trí tuệ nhân tạo tập trung vào phát triển các thuật toán và mô hình thống kê cho phép các hệ thống máy tính cải thiện hiệu suất của chúng trên một nhiệm vụ cụ thể thông qua kinh nghiệm. Không giống như lập trình truyền thống nơi các quy tắc rõ ràng được định nghĩa, các hệ thống ML học các mẫu từ dữ liệu.

Lĩnh vực này đã phát triển theo cấp số nhân trong những năm gần đây do sức mạnh tính toán tăng lên, sự sẵn có của các tập dữ liệu lớn và cải tiến thuật toán. Những bước đột phá chính bao gồm mạng nơ-ron tích chập để xử lý hình ảnh, kiến trúc transformer cho các mô hình ngôn ngữ và mạng đối kháng tổng quát cho việc tạo nội dung.

Nguyên tắc cơ bản liên quan đến huấn luyện các mô hình trên dữ liệu lịch sử để đưa ra dự đoán hoặc quyết định mà không được lập trình tường minh. Sự thay đổi mô hình này đã cho phép các ứng dụng trước đây được coi là không thể, từ xe tự lái đến các hệ thống chẩn đoán y tế.`,
    highlights: [
      { keyword: 'thuật toán và mô hình thống kê', source_quote: 'phát triển các thuật toán và mô hình thống kê cho phép các hệ thống máy tính cải thiện hiệu suất' },
      { keyword: 'học các mẫu từ dữ liệu', source_quote: 'các hệ thống ML học các mẫu từ dữ liệu' },
      { keyword: 'sức mạnh tính toán', source_quote: 'Lĩnh vực này đã phát triển theo cấp số nhân trong những năm gần đây do sức mạnh tính toán tăng lên' },
      { keyword: 'kiến trúc transformer', source_quote: 'kiến trúc transformer cho các mô hình ngôn ngữ' },
      { keyword: 'xe tự lái', source_quote: 'từ xe tự lái đến các hệ thống chẩn đoán y tế' },
    ],
  },
  lessons: [
    {
      id: 'l1',
      title: 'Giới thiệu Học máy',
      keyConcept: 'Học máy là một phương pháp phân tích dữ liệu tự động hóa việc xây dựng mô hình phân tích. Nó sử dụng các thuật toán học iteratively từ dữ liệu.',
      example: 'Bộ lọc thư rác email học từ hàng triệu email để phân biệt thư rác với các thư hợp lệ mà không cần được lập trình tường minh với các quy tắc.',
    },
    {
      id: 'l2',
      title: 'Học có giám sát',
      keyConcept: 'Học có giám sát sử dụng các tập dữ liệu được gắn nhãn để huấn luyện các thuật toán phân loại dữ liệu hoặc dự đoán kết quả chính xác.',
      example: 'Huấn luyện một mô hình với hình ảnh được gắn nhãn của mèo và chó để phân loại chính xác các hình ảnh mới chưa từng thấy.',
    },
    {
      id: 'l3',
      title: 'Mạng Nơ-ron',
      keyConcept: 'Mạng nơ-ron là các hệ thống máy tính lấy cảm hứng từ các mạng nơ-ron sinh học, bao gồm các nút kết nối xử lý thông tin.',
      example: 'Các hệ thống nhận dạng hình ảnh sử dụng mạng nơ-ron tích chập để xác định các đối tượng, khuôn mặt và văn bản trong ảnh.',
    },
    {
      id: 'l4',
      title: 'Học Sâu',
      keyConcept: 'Học sâu sử dụng nhiều lớp mạng nơ-ron để từng bước trích xuất các đặc trưng bậc cao hơn từ đầu vào thô.',
      example: 'Các mô hình GPT sử dụng các mạng transformer sâu với hàng tỷ tham số để hiểu và tạo ra văn bản giống con người.',
    },
  ],
  quiz: [
    {
      id: 'q1',
      type: 'mcq',
      question: 'Sự khác biệt chính giữa học máy và lập trình truyền thống là gì?',
      options: [
        'ML cần nhiều sức mạnh xử lý hơn',
        'ML học từ dữ liệu thay vì tuân theo các quy tắc rõ ràng',
        'ML chỉ có thể hoạt động với dữ liệu số',
        'ML luôn chính xác hơn',
      ],
      answer: 'ML học từ dữ liệu thay vì tuân theo các quy tắc rõ ràng',
      explanation: 'Lập trình truyền thống yêu cầu các nhà phát triển định nghĩa rõ ràng các quy tắc, trong khi các thuật toán học máy tự động khám phá các mẫu và quy tắc từ dữ liệu.',
    },
    {
      id: 'q2',
      type: 'trueFalse',
      question: 'Mạng nơ-ron được phát minh vào năm 2015 cùng với sự phát triển của học sâu.',
      answer: 'Sai',
      explanation: 'Mạng nơ-ron có nguồn gốc từ những năm 1940-1950. Perceptron, một mạng nơ-ron sơ khai, được phát minh bởi Frank Rosenblatt vào năm 1957. Sự phục hưng học sâu bắt đầu vào khoảng năm 2012.',
    },
    {
      id: 'q3',
      type: 'mcq',
      question: 'Loại học nào sử dụng các tập dữ liệu được gắn nhãn?',
      options: [
        'Học không giám sát',
        'Học tăng cường',
        'Học có giám sát',
        'Học chuyển giao',
      ],
      answer: 'Học có giám sát',
      explanation: 'Học có giám sát yêu cầu dữ liệu được gắn nhãn trong đó các cặp đầu vào-đầu ra được biết, cho phép mô hình học ánh xạ giữa đầu vào và đầu ra mong muốn.',
    },
    {
      id: 'q4',
      type: 'shortAnswer',
      question: 'Đặt tên một ứng dụng thực tế của học máy được đề cập trong nội dung.',
      answer: 'Ví dụ bao gồm: xe tự lái, chẩn đoán y tế, nhận dạng hình ảnh, bộ lọc thư rác hoặc xử lý ngôn ngữ tự nhiên',
      explanation: 'Học máy có nhiều ứng dụng. Nội dung cụ thể đề cập đến xe tự lái, các hệ thống chẩn đoán y tế và xử lý ngôn ngữ tự nhiên.',
    },
    {
      id: 'q5',
      type: 'trueFalse',
      question: 'Học sâu chỉ sử dụng một mạng nơ-ron lớp duy nhất.',
      answer: 'Sai',
      explanation: 'Học sâu đặc biệt đề cập đến các mạng nơ-ron có nhiều lớp (mạng sâu) có thể học các biểu diễn phân cấp của dữ liệu.',
    },
  ],
  mindmap: {
    id: 'root',
    label: '🧠 Học Máy',
    children: [
      {
        id: 'types',
        label: '📚 Các loại Học Máy',
        children: [
          {
            id: 't1',
            label: 'Học có Giám sát',
            children: [
              { id: 't1-1', label: 'Phân loại' },
              { id: 't1-2', label: 'Hồi quy' },
            ],
          },
          {
            id: 't2',
            label: 'Học không Giám sát',
            children: [
              { id: 't2-1', label: 'Gom cụm' },
              { id: 't2-2', label: 'Giảm chiều' },
            ],
          },
          {
            id: 't3',
            label: 'Học Tăng cường',
            children: [
              { id: 't3-1', label: 'Q-Learning' },
              { id: 't3-2', label: 'Policy Gradient' },
            ],
          },
        ],
      },
      {
        id: 'concepts',
        label: '🔑 Khái niệm Chính',
        children: [
          {
            id: 'c1',
            label: 'Mạng Nơ-ron',
            children: [
              { id: 'c1-1', label: 'Perceptron' },
              { id: 'c1-2', label: 'MLP' },
              { id: 'c1-3', label: 'CNN' },
            ],
          },
          {
            id: 'c2',
            label: 'Học Sâu',
            children: [
              { id: 'c2-1', label: 'Transformer' },
              { id: 'c2-2', label: 'LSTM' },
              { id: 'c2-3', label: 'GAN' },
            ],
          },
          {
            id: 'c3',
            label: 'Dữ liệu & Huấn luyện',
            children: [
              { id: 'c3-1', label: 'Tập huấn luyện' },
              { id: 'c3-2', label: 'Tập kiểm tra' },
              { id: 'c3-3', label: 'Chuẩn hóa' },
            ],
          },
        ],
      },
      {
        id: 'applications',
        label: '🚀 Ứng dụng Thực tế',
        children: [
          {
            id: 'a1',
            label: 'Thị giác Máy tính',
            children: [
              { id: 'a1-1', label: 'Nhận dạng hình ảnh' },
              { id: 'a1-2', label: 'Phát hiện vật thể' },
              { id: 'a1-3', label: 'Nhận diện khuôn mặt' },
            ],
          },
          {
            id: 'a2',
            label: 'Xử lý Ngôn ngữ Tự nhiên',
            children: [
              { id: 'a2-1', label: 'Dịch máy' },
              { id: 'a2-2', label: 'Phân loại văn bản' },
              { id: 'a2-3', label: 'Chatbot' },
            ],
          },
          {
            id: 'a3',
            label: 'Các lĩnh vực khác',
            children: [
              { id: 'a3-1', label: 'Xe tự lái' },
              { id: 'a3-2', label: 'Chẩn đoán y tế' },
              { id: 'a3-3', label: 'Hệ khuyến nghị' },
            ],
          },
        ],
      },
      {
        id: 'algorithms',
        label: '⚙️ Thuật toán Phổ biến',
        children: [
          {
            id: 'alg1',
            label: 'Cây quyết định',
            children: [
              { id: 'alg1-1', label: 'ID3' },
              { id: 'alg1-2', label: 'C4.5' },
            ],
          },
          {
            id: 'alg2',
            label: 'Ensemble Methods',
            children: [
              { id: 'alg2-1', label: 'Random Forest' },
              { id: 'alg2-2', label: 'XGBoost' },
            ],
          },
          {
            id: 'alg3',
            label: 'SVM & K-Means',
            children: [
              { id: 'alg3-1', label: 'Support Vector Machine' },
              { id: 'alg3-2', label: 'K-Means Clustering' },
            ],
          },
        ],
      },
    ],
  },
}
