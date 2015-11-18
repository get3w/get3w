package s3

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
	"github.com/aws/aws-sdk-go/service/s3/s3manager"
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Service s3 service
type Service struct {
	bucket   string
	name     string
	instance *s3.S3
}

// NewService return new service
func NewService(bucket string, name string) *Service {
	if bucket == "" || name == "" {
		return &Service{}
	}

	return &Service{
		bucket:   bucket,
		name:     name,
		instance: s3.New(session.New(), &aws.Config{}),
	}
}

// getAppPrefix return app prefix
func (service *Service) getAppPrefix(prefix string) string {
	prefix = path.Join(service.name, prefix)
	prefix = strings.Trim(prefix, "/") + "/"
	return prefix
}

// getAppKey return app key
func (service *Service) getAppKey(key string) string {
	key = path.Join(service.name, key)
	key = strings.Trim(key, "/")
	return key
}

// getAllKeys return all keys by prefix
func (service *Service) getAllKeys(prefix string) ([]string, error) {
	if service.instance == nil {
		return []string{}, fmt.Errorf("service not avaliable")
	}

	keys := []string{}

	params := &s3.ListObjectsInput{
		Bucket: aws.String(service.bucket), // Required
		Prefix: aws.String(service.getAppPrefix(prefix)),
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
	if service.instance == nil {
		return []*get3w.File{}, fmt.Errorf("service not avaliable")
	}

	files := []*get3w.File{}

	params := &s3.ListObjectsInput{
		Bucket:    aws.String(service.bucket), // Required
		Prefix:    aws.String(service.getAppPrefix(prefix)),
		Delimiter: aws.String("/"),
	}
	resp, err := service.instance.ListObjects(params)

	if err != nil {
		return nil, err
	}

	for _, commonPrefix := range resp.CommonPrefixes {
		filePath := strings.Trim(strings.Replace(*commonPrefix.Prefix, service.name, "", 1), "/")
		name := path.Base(filePath)

		dir := &get3w.File{
			IsDir: true,
			Path:  filePath,
			Name:  name,
			Size:  0,
		}
		files = append(files, dir)
	}

	for _, content := range resp.Contents {
		if strings.HasSuffix(*content.Key, "/") {
			continue
		}
		filePath := strings.Trim(strings.Replace(*content.Key, service.name, "", 1), "/")
		name := path.Base(filePath)
		size := *content.Size

		file := &get3w.File{
			IsDir: false,
			Path:  filePath,
			Name:  name,
			Size:  size,
		}
		files = append(files, file)
	}

	return files, nil
}

// Write string content to specified key resource
func (service *Service) Write(key string, content string) error {
	return service.WriteBinary(key, []byte(content))
}

// WriteBinary upload file
func (service *Service) WriteBinary(key string, bs []byte) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.PutObjectInput{
		Bucket:      aws.String(service.bucket),         // Required
		Key:         aws.String(service.getAppKey(key)), // Required
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        bytes.NewReader(bs),
	}

	_, err := service.instance.PutObject(params)
	return err
}

// Copy object to destinatioin
func (service *Service) Copy(sourceKey string, destinationKey string) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if sourceKey == "" {
		return fmt.Errorf("sourceKey must be a nonempty string")
	}
	if destinationKey == "" {
		return fmt.Errorf("destinationKey must be a nonempty string")
	}

	params := &s3.CopyObjectInput{
		Bucket:     aws.String(service.bucket),                                      // Required
		CopySource: aws.String(service.bucket + "/" + service.getAppKey(sourceKey)), // Required
		Key:        aws.String(service.getAppKey(destinationKey)),                   // Required
		ACL:        aws.String(s3.ObjectCannedACLPublicRead),
	}
	_, err := service.instance.CopyObject(params)
	return err
}

// Rename rename the app
func (service *Service) Rename(newName string, deleteAll bool) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if newName == "" {
		return fmt.Errorf("newName must be a nonempty string")
	}

	allKeys, err := service.getAllKeys("")
	if err != nil {
		return err
	}

	for _, key := range allKeys {
		destinationKey := strings.Replace(key, service.name, newName, 1)
		params := &s3.CopyObjectInput{
			Bucket:     aws.String(service.bucket),             // Required
			CopySource: aws.String(service.bucket + "/" + key), // Required
			Key:        aws.String(destinationKey),             // Required
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

// Read return resource content
func (service *Service) Read(key string) (string, error) {
	if service.instance == nil {
		return "", fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.GetObjectInput{
		Bucket: aws.String(service.bucket),         // Required
		Key:    aws.String(service.getAppKey(key)), // Required
	}
	resp, err := service.instance.GetObject(params)

	if err != nil {
		return "", err
	}

	return stringutils.ReaderToString(resp.Body), nil
}

// Upload upload object
func (service *Service) Upload(key string, filePath string) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
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
		Bucket:      aws.String(service.bucket),
		Key:         aws.String(service.getAppKey(key)),
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        file,
	})

	return err
}

// Download download object
func (service *Service) Download(key string, directoryPath string) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if directoryPath == "" {
		return fmt.Errorf("directoryPath must be a nonempty string")
	}

	result, err := service.instance.GetObject(&s3.GetObjectInput{
		Bucket: aws.String(service.bucket),
		Key:    aws.String(service.getAppKey(key)),
	})
	if err != nil {
		return err
	}

	filePath, err := filepath.Abs(path.Join(directoryPath, path.Base(key)))
	if err != nil {
		return err
	}

	os.MkdirAll(directoryPath, os.ModeDir)
	file, err := os.Create(filePath)
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, result.Body); err != nil {
		return err
	}
	result.Body.Close()
	file.Close()
	return nil
}

// IsExist return true if specified key exists
func (service *Service) IsExist(key string) bool {
	if service.instance == nil || key == "" {
		return false
	}

	_, err := service.instance.HeadObject(&s3.HeadObjectInput{
		Bucket: aws.String(service.bucket),
		Key:    aws.String(service.getAppKey(key)),
	})
	if err != nil {
		return false
	}
	return true
}

// Delete specified object
func (service *Service) Delete(key string) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.DeleteObjectInput{
		Bucket: aws.String(service.bucket),         // Required
		Key:    aws.String(service.getAppKey(key)), // Required
	}
	_, err := service.instance.DeleteObject(params)
	return err
}

// Deletes delete objects
func (service *Service) Deletes(keys []string) error {
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}
	if len(keys) == 0 {
		return fmt.Errorf("keys must be a nonempty string array")
	}

	objects := make([]*s3.ObjectIdentifier, len(keys))
	for index, key := range keys {
		objects[index] = &s3.ObjectIdentifier{ // Required
			Key: aws.String(service.getAppKey(key)), // Required
		}
	}

	params := &s3.DeleteObjectsInput{
		Bucket: aws.String(service.bucket), // Required
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
	if service.instance == nil {
		return fmt.Errorf("service not avaliable")
	}

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
		Bucket: aws.String(service.bucket), // Required
		Delete: &s3.Delete{ // Required
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	}
	_, err = service.instance.DeleteObjects(params)
	return err
}
