package site

import "github.com/get3w/get3w/storage/s3"

// NewS3Site get key by pageName
func NewS3Site(bucketname, appname string) *Site {
	service := s3.NewService(bucketname)
	return &Site{
		Name:                  appname,
		ReadObject:            service.ReadObject,
		WriteObject:           service.WriteObject,
		CopyObject:            service.CopyObject,
		DeleteObjectsByPrefix: service.DeleteObjectsByPrefix,
		DeleteObject:          service.DeleteObject,
		GetKeys:               service.GetKeys,
		GetFiles:              service.GetFiles,
	}
}
