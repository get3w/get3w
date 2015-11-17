package awss3

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"io"
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
)

// S3Service s3 service
type S3Service struct {
	bucketName string
	instance   *s3.S3
}

// NewService return new service
func NewService(bucketName string) *S3Service {
	if bucketName == "" {
		return &S3Service{}
	}

	return &S3Service{
		bucketName: bucketName,
		instance:   s3.New(session.New(), &aws.Config{}),
	}
}

// GetURL get resource url
func (service *S3Service) GetURL(key string) string {
	return fmt.Sprintf("http://%s/%s", service.bucketName, key)
}

// GetKeys return all keys by prefix
func (service *S3Service) GetKeys(prefix string) ([]string, error) {
	keys := []string{}

	if service.instance != nil {
		params := &s3.ListObjectsInput{
			Bucket: aws.String(service.bucketName), // Required
			Prefix: aws.String(prefix),
		}
		resp, err := service.instance.ListObjects(params)

		if err != nil {
			return nil, err
		}
		for _, value := range resp.Contents {
			keys = append(keys, *value.Key)
		}
	}

	return keys, nil
}

// GetFiles return all files by appname and prefix
func (service *S3Service) GetFiles(appname string, prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	if service.instance != nil && appname != "" {
		prefix = path.Join(appname, prefix)
		prefix = strings.Trim(prefix, "/") + "/"

		params := &s3.ListObjectsInput{
			Bucket:    aws.String(service.bucketName), // Required
			Prefix:    aws.String(prefix),
			Delimiter: aws.String("/"),
		}
		resp, err := service.instance.ListObjects(params)

		if err != nil {
			return nil, err
		}

		for _, commonPrefix := range resp.CommonPrefixes {
			filePath := strings.Trim(strings.Replace(*commonPrefix.Prefix, appname, "", 1), "/")
			name := path.Base(filePath)

			dir := &get3w.File{
				IsDirectory: true,
				Path:        filePath,
				Name:        name,
				Size:        0,
			}
			files = append(files, dir)
		}

		for _, content := range resp.Contents {
			if strings.HasSuffix(*content.Key, "/") {
				continue
			}
			filePath := strings.Trim(strings.Replace(*content.Key, appname, "", 1), "/")
			name := path.Base(filePath)
			size := *content.Size

			file := &get3w.File{
				IsDirectory: false,
				Path:        filePath,
				Name:        name,
				Size:        size,
			}
			files = append(files, file)
		}
	}

	return files, nil
}

// ReadObject return resource content
func (service *S3Service) ReadObject(key string) (string, error) {
	if service.instance != nil && len(key) > 0 {
		params := &s3.GetObjectInput{
			Bucket: aws.String(service.bucketName), // Required
			Key:    aws.String(key),                // Required
		}
		resp, err := service.instance.GetObject(params)

		if err != nil {
			return "", err
		}

		return stringutils.ReaderToString(resp.Body), nil
	}
	return "", nil
}

// WriteObject write string content to specified key resource
func (service *S3Service) WriteObject(key string, content string) error {
	if service.instance != nil && key != "" {
		params := &s3.PutObjectInput{
			Bucket:      aws.String(service.bucketName), // Required
			Key:         aws.String(key),                // Required
			ACL:         aws.String(s3.ObjectCannedACLPublicRead),
			ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
			Body:        bytes.NewReader([]byte(content)),
		}
		_, err := service.instance.PutObject(params)

		if err != nil {
			return err
		}
	}

	return nil
}

// WriteBinaryObject upload file
func (service *S3Service) WriteBinaryObject(key string, bs []byte) (bool, error) {
	if service.instance != nil && key != "" {
		params := &s3.PutObjectInput{
			Bucket:      aws.String(service.bucketName), // Required
			Key:         aws.String(key),                // Required
			ACL:         aws.String(s3.ObjectCannedACLPublicRead),
			ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
			Body:        bytes.NewReader(bs),
		}

		_, err := service.instance.PutObject(params)

		if err != nil {
			return false, err
		}
		return true, nil
	}

	return false, nil
}

// DeleteObject delete specified object
func (service *S3Service) DeleteObject(key string) error {
	if service.instance != nil && key != "" {
		params := &s3.DeleteObjectInput{
			Bucket: aws.String(service.bucketName), // Required
			Key:    aws.String(key),                // Required
		}
		_, err := service.instance.DeleteObject(params)

		return err
	}
	return nil
}

// DeleteObjectsByPrefix delete objects by prefix
func (service *S3Service) DeleteObjectsByPrefix(prefix string) error {
	if prefix != "" {
		keys, err := service.GetKeys(prefix)
		if err != nil {
			return err
		}
		return service.DeleteObjects(keys)
	}
	return nil
}

// DeleteObjects delete objects
func (service *S3Service) DeleteObjects(keys []string) error {
	if service.instance != nil {
		objects := make([]*s3.ObjectIdentifier, len(keys))
		for index, value := range keys {
			objects[index] = &s3.ObjectIdentifier{ // Required
				Key: aws.String(value), // Required
			}
		}

		params := &s3.DeleteObjectsInput{
			Bucket: aws.String(service.bucketName), // Required
			Delete: &s3.Delete{ // Required
				Objects: objects,
				Quiet:   aws.Bool(true),
			},
		}
		_, err := service.instance.DeleteObjects(params)
		return err
	}
	return nil
}

// CopyObject copy object to destinatioin
func (service *S3Service) CopyObject(sourceKey string, destinationKey string) error {
	if service.instance != nil && sourceKey != "" && destinationKey != "" {
		var copySource = service.bucketName + "/" + sourceKey

		params := &s3.CopyObjectInput{
			Bucket:     aws.String(service.bucketName), // Required
			CopySource: aws.String(copySource),         // Required
			Key:        aws.String(destinationKey),     // Required
			ACL:        aws.String(s3.ObjectCannedACLPublicRead),
		}
		_, err := service.instance.CopyObject(params)
		return err
	}
	return nil
}

// UploadObject upload object
func (service *S3Service) UploadObject(key string, filePath string) (string, error) {
	if service.instance != nil && key != "" && filePath != "" {
		file, err := os.Open(filePath)
		if err != nil {
			return "", err
		}

		reader, writer := io.Pipe()
		go func() {
			gw := gzip.NewWriter(writer)
			io.Copy(gw, file)

			file.Close()
			gw.Close()
			writer.Close()
		}()

		uploader := s3manager.NewUploader(nil)
		_, err = uploader.Upload(&s3manager.UploadInput{
			Bucket:      aws.String(service.bucketName),
			Key:         aws.String(key),
			ACL:         aws.String(s3.ObjectCannedACLPublicRead),
			ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
			Body:        reader,
		})

		if err != nil {
			return "", err
		}

		return service.GetURL(key), nil
	}
	return "", nil
}

// DownloadObject download object
func (service *S3Service) DownloadObject(key string, directoryPath string) error {
	if service.instance != nil && key != "" && directoryPath != "" {
		result, err := service.instance.GetObject(&s3.GetObjectInput{
			Bucket: aws.String(service.bucketName),
			Key:    aws.String(key),
		})
		if err != nil {
			return err
		}

		filePath := path.Join(directoryPath, key)
		file, err := os.Create(filePath)
		if err != nil {
			return err
		}
		if _, err := io.Copy(file, result.Body); err != nil {
			return err
		}
		result.Body.Close()
		file.Close()
	}
	return nil
}

// ExistObject return true if specified key exists
func (service *S3Service) ExistObject(key string) (bool, error) {
	if service.instance != nil && key != "" {
		_, err := service.instance.HeadObject(&s3.HeadObjectInput{
			Bucket: aws.String(service.bucketName),
			Key:    aws.String(key),
		})
		if err != nil {
			return false, err
		}
		return true, nil
	}

	return false, nil
}
