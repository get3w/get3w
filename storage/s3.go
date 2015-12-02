package storage

import "github.com/get3w/get3w/storage/s3"

// NewS3Site returns a new s3 site
func NewS3Site(bucketSource, bucketBuild, owner, name string) (*Site, error) {
	service, err := s3.NewService(bucketSource, bucketBuild, owner, name)
	if err != nil {
		return nil, err
	}

	return &Site{
		Name:              name,
		Read:              service.Read,
		Checksum:          service.Checksum,
		Write:             service.Write,
		WriteDestination:  service.WriteDestination,
		Download:          service.Download,
		Rename:            service.Rename,
		Delete:            service.Delete,
		DeleteDestination: service.DeleteDestination,
		DeleteAll:         service.DeleteAll,
		GetFiles:          service.GetFiles,
		GetAllFiles:       service.GetAllFiles,
		IsExist:           service.IsExist,
	}, nil
}
