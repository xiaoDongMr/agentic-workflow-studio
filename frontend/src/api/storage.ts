import { http } from '@/api/http'

export interface UploadedMedia {
  url: string
  filename: string
  contentType: string
  size: number
}

interface UploadedMediaDto {
  url: string
  filename: string
  content_type: string
  size: number
}

function toUploadedMedia(item: UploadedMediaDto): UploadedMedia {
  return {
    url: item.url,
    filename: item.filename,
    contentType: item.content_type,
    size: item.size,
  }
}

export async function uploadMediaFile(file: File): Promise<UploadedMedia> {
  const formData = new FormData()
  formData.append('file', file)
  const { data } = await http.post<UploadedMediaDto>('/storage/uploads', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return toUploadedMedia(data)
}

