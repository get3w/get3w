package storage

import "github.com/get3w/get3w/storage/local"

// NewLocalSite return local site
func NewLocalSite(contextDir string) (*Site, error) {
	service, err := local.NewService(contextDir)
	if err != nil {
		return nil, err
	}

	return &Site{
		Name:              service.Name,
		Path:              service.Path,
		Read:              service.Read,
		Checksum:          service.Checksum,
		Write:             service.Write,
		WriteDestination:  service.WriteDestination,
		Download:          service.Download,
		Rename:            nil,
		Delete:            service.Delete,
		DeleteDestination: service.DeleteDestination,
		DeleteAll:         service.DeleteAll,
		GetFiles:          service.GetFiles,
		GetAllFiles:       service.GetAllFiles,
		IsExist:           service.IsExist,
	}, nil
}
