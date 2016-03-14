package s3utils

import (
	"bytes"
	"fmt"
	"mime"
	"path"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/s3"
)

var s3Instance *s3.S3

func init() {
	s3Instance = s3.New(session.New())
}

// Presign returns the request's signed URL. Error will be returned
// if the signing fails.
func Presign(bucket, key string) (string, error) {
	if bucket == "" {
		return "", fmt.Errorf("bucket must be a nonempty string")
	}
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	req, _ := s3Instance.GetObjectRequest(&s3.GetObjectInput{
		Bucket: aws.String(bucket),
		Key:    aws.String(key),
	})
	return req.Presign(30 * time.Minute)
}

// Write bytes to specified key resource
func Write(bucket, key string, bs []byte) error {
	if bucket == "" {
		return fmt.Errorf("bucket must be a nonempty string")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	params := &s3.PutObjectInput{
		Bucket:      aws.String(bucket), // Required
		Key:         aws.String(key),    // Required
		ACL:         aws.String(s3.ObjectCannedACLPublicRead),
		ContentType: aws.String(mime.TypeByExtension(path.Ext(key))),
		Body:        bytes.NewReader(bs),
	}

	_, err := s3Instance.PutObject(params)
	return err
}

// GetAllKeys returns all keys in the app
func GetAllKeys(bucket, prefix string) ([]string, error) {
	keys := []string{}

	params := &s3.ListObjectsInput{
		Bucket: aws.String(bucket), // Required
		Prefix: aws.String(strings.Trim(prefix, "/") + "/"),
	}
	resp, err := s3Instance.ListObjects(params)

	if err != nil {
		return nil, err
	}
	for _, value := range resp.Contents {
		keys = append(keys, *value.Key)
	}

	return keys, nil
}

// GetFolderNamesAndFileNames return folder names and file names
func GetFolderNamesAndFileNames(bucket, prefix string) ([]string, []string, error) {
	folders := []string{}
	files := []string{}

	prefix = strings.Trim(prefix, "/") + "/"
	params := &s3.ListObjectsInput{
		Bucket:    aws.String(bucket), // Required
		Prefix:    aws.String(prefix),
		Delimiter: aws.String("/"),
	}
	resp, err := s3Instance.ListObjects(params)

	if err != nil {
		println(err.Error())
		return nil, nil, err
	}

	for _, commonPrefix := range resp.CommonPrefixes {
		folder := strings.Trim(*commonPrefix.Prefix, "/")
		folder = strings.TrimPrefix(folder, prefix)
		folders = append(folders, folder)
	}

	for _, content := range resp.Contents {
		if strings.HasSuffix(*content.Key, "/") {
			continue
		}
		file := strings.TrimPrefix(*content.Key, prefix)
		files = append(files, file)
	}

	return folders, files, nil
}

// IsExist return true if specified key exists
func IsExist(bucket, owner, name string) bool {
	params := &s3.ListObjectsInput{
		Bucket:  aws.String(bucket), // Required
		Prefix:  aws.String(owner + "/" + name + "/"),
		MaxKeys: aws.Int64(1),
	}
	resp, err := s3Instance.ListObjects(params)

	if err != nil {
		return false
	}
	if len(resp.Contents) > 0 {
		return true
	}

	return false
}

// CopyAll copy all folders and files in the prefix to newPrefix and return all keys in prefix
func CopyAll(bucket, prefix, newPrefix string) ([]string, error) {
	if prefix == newPrefix {
		return nil, nil
	}

	allKeys, err := GetAllKeys(bucket, prefix)
	if err != nil {
		return nil, err
	}

	for _, key := range allKeys {
		destinationKey := strings.Replace(key, prefix, newPrefix, 1)
		params := &s3.CopyObjectInput{
			Bucket:     aws.String(bucket),             // Required
			CopySource: aws.String(bucket + "/" + key), // Required
			Key:        aws.String(destinationKey),     // Required
			ACL:        aws.String(s3.ObjectCannedACLPublicRead),
		}
		_, err := s3Instance.CopyObject(params)
		if err != nil {
			return nil, err
		}
	}
	return allKeys, nil
}

// DeleteAll delete objects by prefix
func DeleteAll(bucket string, keys []string) error {
	objects := make([]*s3.ObjectIdentifier, len(keys))
	for index, key := range keys {
		objects[index] = &s3.ObjectIdentifier{ // Required
			Key: aws.String(key), // Required
		}
	}

	params := &s3.DeleteObjectsInput{
		Bucket: aws.String(bucket), // Required
		Delete: &s3.Delete{ // Required
			Objects: objects,
			Quiet:   aws.Bool(true),
		},
	}
	_, err := s3Instance.DeleteObjects(params)
	return err
}
