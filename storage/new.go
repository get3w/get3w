package storage

import (
	"github.com/get3w/get3w/storage/local"
	"github.com/get3w/get3w/storage/s3"
)

// NewLocalSite return local site
func NewLocalSite(contextDir string) (*Site, error) {
	service, err := local.NewService(contextDir)
	if err != nil {
		return nil, err
	}

	return &Site{
		Name:                 service.Name,
		Path:                 service.Path,
		GetSourcePrefix:      service.GetSourcePrefix,
		GetDestinationPrefix: service.GetDestinationPrefix,
		GetSourceKey:         service.GetSourceKey,
		GetDestinationKey:    service.GetDestinationKey,
		Read:                 service.Read,
		Checksum:             service.Checksum,
		Write:                service.Write,
		WriteDestination:     service.WriteDestination,
		Download:             service.Download,
		Rename:               nil,
		CopyToDestination:    service.CopyToDestination,
		Delete:               service.Delete,
		DeleteDestination:    service.DeleteDestination,
		DeleteAll:            service.DeleteAll,
		GetFiles:             service.GetFiles,
		GetAllFiles:          service.GetAllFiles,
		IsExist:              service.IsExist,
	}, nil
}

// NewS3Site returns a new s3 site
func NewS3Site(bucketSource, bucketDestination, owner, name string) (*Site, error) {
	service, err := s3.NewService(bucketSource, bucketDestination, owner, name)
	if err != nil {
		return nil, err
	}

	return &Site{
		Name:                 name,
		Path:                 owner + "/" + name,
		GetSourcePrefix:      service.GetSourcePrefix,
		GetDestinationPrefix: service.GetDestinationPrefix,
		GetSourceKey:         service.GetSourceKey,
		GetDestinationKey:    service.GetDestinationKey,
		Read:                 service.Read,
		Checksum:             service.Checksum,
		Write:                service.Write,
		WriteDestination:     service.WriteDestination,
		Download:             service.Download,
		Rename:               service.Rename,
		CopyToDestination:    service.CopyToDestination,
		Delete:               service.Delete,
		DeleteDestination:    service.DeleteDestination,
		DeleteAll:            service.DeleteAll,
		GetFiles:             service.GetFiles,
		GetAllFiles:          service.GetAllFiles,
		IsExist:              service.IsExist,
	}, nil
}
