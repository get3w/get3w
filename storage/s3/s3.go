package s3

import (
	"bytes"
	"fmt"
	"mime"
	"os"
	"path"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
	"github.com/get3w/get3w/pkg/timeutils"
)

// Service s3 service
type Service struct {
	bucketSource      string
	bucketDestination string
	prefix            string
	instance          *s3.S3
}

// NewService return new service
func NewService(bucketSource, bucketDestination, owner, name string) (*Service, error) {
	if bucketSource == "" {
		return nil, fmt.Errorf("bucketSource must be a nonempty string")
	}
	if bucketDestination == "" {
		return nil, fmt.Errorf("bucketDestination must be a nonempty string")
	}
	if owner == "" {
		return nil, fmt.Errorf("owner must be a nonempty string")
	}
	if name == "" {
		return nil, fmt.Errorf("name must be a nonempty string")
	}

	return &Service{
		bucketSource:      bucketSource,
		bucketDestination: bucketDestination,
		prefix:            owner + "/" + name,
		instance:          s3.New(session.New()),
	}, nil
}

// GetSourcePrefix return app prefix
func (service *Service) GetSourcePrefix(prefix string) string {
	p := path.Join(service.prefix, prefix)
	p = strings.Trim(p, "/") + "/"
	return p
}

// GetDestinationPrefix return app prefix
func (service *Service) GetDestinationPrefix(prefix string) string {
	p := path.Join(service.prefix, prefix)
	p = strings.Trim(p, "/") + "/"
	return p
}

// GetSourceKey get file key by relatedURL
func (service *Service) GetSourceKey(key ...string) string {
	p := path.Join(service.prefix, path.Join(key...))
	p = strings.Trim(p, "/")
	return p
}

// GetDestinationKey get file key by relatedURL
func (service *Service) GetDestinationKey(key ...string) string {
	p := path.Join(service.prefix, path.Join(key...))
	p = strings.Trim(p, "/")
	return p
}

// getAllKeys return all keys by prefix
func (service *Service) getAllKeys(prefix string) ([]string, error) {
	keys := []string{}

	params := &s3.ListObjectsInput{
		Bucket: aws.String(service.bucketSource), // Required
		Prefix: aws.String(prefix),
	}
	resp, err := service.instance.ListObjects(params)

	if err != nil {
		return nil, err
	}
	for _, value := range resp.Contents {
		keys = append(keys, *value.Key)
	}

	return keys, nil
}

// GetFiles return all files by appname and prefix
func (service *Service) GetFiles(prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	params := &s3.ListObjectsInput{
		Bucket:    aws.String(service.bucketSource), // Required
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
	}
	resp, err := service.instance.ListObjects(params)

	if err != nil {
		return nil, err
	}

	for _, commonPrefix := range resp.CommonPrefixes {
		filePath := strings.Trim(strings.Replace(*commonPrefix.Prefix, service.prefix, "", 1), "/")
		name := path.Base(filePath)

		dir := &get3w.File{
			IsDir: true,
			Path:  filePath,
			Name:  name,
		}
		files = append(files, dir)
	}

	for _, content := range resp.Contents {
		if strings.HasSuffix(*content.Key, "/") {
			continue
		}
		filePath := strings.Trim(strings.Replace(*content.Key, service.prefix, "", 1), "/")
		name := path.Base(filePath)
		size := *content.Size
		checksum := strings.Trim(*content.ETag, "\"")
		lastModified := *content.LastModified

		file := &get3w.File{
			IsDir:        false,
			Path:         filePath,
			Name:         name,
			Size:         size,
			Checksum:     checksum,
			LastModified: timeutils.ToString(lastModified),
		}
		files = append(files, file)
	}

	return files, nil
}

// GetAllFiles return all files by appname and prefix
func (service *Service) GetAllFiles(prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	params := &s3.ListObjectsInput{
		Bucket: aws.String(service.bucketSource), // Required
		Prefix: aws.String(prefix),
	}
	resp, err := service.instance.ListObjects(params)

	if err != nil {
		return nil, err
	}

	for _, commonPrefix := range resp.CommonPrefixes {
		filePath := strings.Trim(strings.Replace(*commonPrefix.Prefix, service.prefix, "", 1), "/")
		name := path.Base(filePath)

		dir := &get3w.File{
			IsDir: true,
			Path:  filePath,
			Name:  name,
		}
		files = append(files, dir)
	}

	for _, content := range resp.Contents {
		if strings.HasSuffix(*content.Key, "/") {
			continue
		}
		filePath := strings.Trim(strings.Replace(*content.Key, service.prefix, "", 1), "/")
		name := path.Base(filePath)
		size := *content.Size
		checksum := strings.Trim(*content.ETag, "\"")
		lastModified := *content.LastModified

		file := &get3w.File{
			IsDir:        false,
			Path:         filePath,
			Name:         name,
			Size:         size,
			Checksum:     checksum,
			LastModified: timeutils.ToString(lastModified),
		}
		files = append(files, file)
	}

	return files, nil
}

// Write write string content to specified key resource
func (service *Service) Write(key string, bs []byte) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.PutObjectInput{
		Bucket:      aws.String(service.bucketSource), // Required
		Key:         aws.String(key),                  // Required
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        bytes.NewReader(bs),
	}

	_, err := service.instance.PutObject(params)
	return err
}

// WriteDestination write string content to specified key resource
func (service *Service) WriteDestination(key string, bs []byte) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.PutObjectInput{
		Bucket:      aws.String(service.bucketDestination), // Required
		Key:         aws.String(key),                       // Required
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        bytes.NewReader(bs),
	}

	_, err := service.instance.PutObject(params)
	return err
}

// CopyToDestination object to destinatioin
func (service *Service) CopyToDestination(sourceKey string, destinationKey string) error {
	if sourceKey == "" {
		return fmt.Errorf("sourceKey must be a nonempty string")
	}
	if destinationKey == "" {
		return fmt.Errorf("destinationKey must be a nonempty string")
	}

	params := &s3.CopyObjectInput{
		Bucket:     aws.String(service.bucketDestination),              // Required
		CopySource: aws.String(service.bucketSource + "/" + sourceKey), // Required
		Key:        aws.String(destinationKey),                         // Required
		ACL:        aws.String(s3.ObjectCannedACLPublicRead),
	}
	_, err := service.instance.CopyObject(params)
	return err
}

// Rename rename the app
func (service *Service) Rename(owner, newName string, deleteAll bool) error {
	if newName == "" {
		return fmt.Errorf("newName must be a nonempty string")
	}

	allKeys, err := service.getAllKeys("")
	if err != nil {
		return err
	}

	for _, key := range allKeys {
		destinationKey := strings.Replace(key, service.prefix, owner+"/"+newName, 1)
		params := &s3.CopyObjectInput{
			Bucket:     aws.String(service.bucketSource),             // Required
			CopySource: aws.String(service.bucketSource + "/" + key), // Required
			Key:        aws.String(destinationKey),                   // Required
			ACL:        aws.String(s3.ObjectCannedACLPublicRead),
		}
		_, err := service.instance.CopyObject(params)
		if err != nil {
			return err
		}
	}
	if deleteAll {
		return service.DeleteAll("")
	}
	return nil
}

// Checksum compute file's MD5 digist
func (service *Service) Checksum(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	head, err := service.instance.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(service.bucketSource),
		Key:    aws.String(key),
	})
	if err != nil {
		return "", err
	}

	return strings.Trim(*head.ETag, "\""), nil
}

// Read return resource content
func (service *Service) Read(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.GetObjectInput{
		Bucket: aws.String(service.bucketSource), // Required
		Key:    aws.String(key),                  // Required
	}
	resp, err := service.instance.GetObject(params)

	if err != nil {
		return "", err
	}

	return stringutils.ReaderToString(resp.Body), nil
}

// Upload upload object
func (service *Service) Upload(key string, filePath string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if filePath == "" {
		return fmt.Errorf("filePath must be a nonempty string")
	}

	file, err := os.Open(filePath)
	if err != nil {
		return err
	}

	defer file.Close()
	uploader := s3manager.NewUploader(session.New())
	_, err = uploader.Upload(&s3manager.UploadInput{
		Bucket:      aws.String(service.bucketSource),
		Key:         aws.String(key),
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        file,
	})

	return err
}

// Download download object
// TODO complete method
func (service *Service) Download(key string, downloadURL string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if downloadURL == "" {
		return fmt.Errorf("downloadURL must be a nonempty string")
	}

	// result, err := service.instance.GetObject(&s3.GetObjectInput{
	// 	Bucket: aws.String(service.bucket),
	// 	Key:    aws.String(service.getAppKey(key)),
	// })
	// if err != nil {
	// 	return err
	// }
	//
	// filePath, err := filepath.Abs(path.Join(directoryPath, path.Base(key)))
	// if err != nil {
	// 	return err
	// }
	//
	// os.MkdirAll(directoryPath, os.ModeDir)
	// file, err := os.Create(filePath)
	// if err != nil {
	// 	return err
	// }
	// if _, err := io.Copy(file, result.Body); err != nil {
	// 	return err
	// }
	// result.Body.Close()
	// file.Close()
	return nil
}

// IsExist return true if specified key exists
func (service *Service) IsExist(key string) bool {
	if key == "" {
		return false
	}

	_, err := service.instance.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(service.bucketSource),
		Key:    aws.String(key),
	})
	if err != nil {
		return false
	}
	return true
}

// Delete specified object
func (service *Service) Delete(key string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.DeleteObjectInput{
		Bucket: aws.String(service.bucketSource), // Required
		Key:    aws.String(key),                  // Required
	}
	_, err := service.instance.DeleteObject(params)
	return err
}

// DeleteDestination specified object
func (service *Service) DeleteDestination(key string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.DeleteObjectInput{
		Bucket: aws.String(service.bucketDestination), // Required
		Key:    aws.String(key),                       // Required
	}
	_, err := service.instance.DeleteObject(params)
	return err
}

// Deletes delete objects
func (service *Service) Deletes(keys []string) error {
	if len(keys) == 0 {
		return fmt.Errorf("keys must be a nonempty string array")
	}

	objects := make([]*s3.ObjectIdentifier, len(keys))
	for index, key := range keys {
		objects[index] = &s3.ObjectIdentifier{ // Required
			Key: aws.String(key), // Required
		}
	}

	params := &s3.DeleteObjectsInput{
		Bucket: aws.String(service.bucketSource), // Required
		Delete: &s3.Delete{ // Required
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	}
	_, err := service.instance.DeleteObjects(params)
	return err
}

// DeleteAll delete objects by prefix
func (service *Service) DeleteAll(prefix string) error {
	keys, err := service.getAllKeys(prefix)
	if err != nil {
		return err
	}

	objects := make([]*s3.ObjectIdentifier, len(keys))
	for index, key := range keys {
		objects[index] = &s3.ObjectIdentifier{ // Required
			Key: aws.String(key), // Required
		}
	}

	params := &s3.DeleteObjectsInput{
		Bucket: aws.String(service.bucketSource), // Required
		Delete: &s3.Delete{ // Required
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	}
	_, err = service.instance.DeleteObjects(params)
	return err
}
