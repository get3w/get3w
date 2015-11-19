package site

import "github.com/get3w/get3w/storage/local"

// NewLocalSite return local site
func NewLocalSite(contextDir string) *Site {
	service := local.NewService(contextDir)
	return &Site{
		Name:        service.Name,
		Read:        service.Read,
		Write:       service.Write,
		WriteBinary: service.WriteBinary,
		Download:    service.Download,
		Rename:      nil,
		Delete:      service.Delete,
		DeleteAll:   service.DeleteAll,
		GetFiles:    service.GetFiles,
		GetAllFiles: service.GetAllFiles,
		IsExist:     service.IsExist,
	}
}
