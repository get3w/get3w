package site

import "github.com/get3w/get3w/storage/s3"

// NewS3Site get key by pageName
func NewS3Site(bucket, appname string) *Site {
	service := s3.NewService(bucket, appname)
	return &Site{
		Name:        appname,
		Read:        service.Read,
		Write:       service.Write,
		WriteBinary: service.WriteBinary,
		Download:    service.Download,
		Rename:      service.Rename,
		Delete:      service.Delete,
		DeleteAll:   service.DeleteAll,
		GetFiles:    service.GetFiles,
		GetAllFiles: service.GetAllFiles,
		IsExist:     service.IsExist,
	}
}
