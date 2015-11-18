package site

import "github.com/get3w/get3w/storage/local"

// NewLocalSite return local site
func NewLocalSite(contextDir, appname string) *Site {
	service := local.NewService(contextDir)
	return &Site{
		Name:      appname,
		Read:      service.Read,
		Write:     service.Write,
		Rename:    nil,
		Delete:    service.Delete,
		DeleteAll: service.DeleteAll,
		GetFiles:  service.GetFiles,
	}
}
