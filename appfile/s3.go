package appfile

import "github.com/get3w/get3w/pkg/awss3"

// NewAppfileByS3 get key by pageName
func NewAppfileByS3(contextDir string, appname string) *Appfile {
	service := awss3.NewService("apps.get3w.com")
	return &Appfile{
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
