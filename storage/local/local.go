package local

import (
	"crypto/md5"
	"fmt"
	"io"
	"io/ioutil"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
)

// Service local service
type Service struct {
	dirPath string
	Name    string
}

// NewService return new service
func NewService(contextDir string) (*Service, error) {
	dirPath, err := getDirPath(contextDir)
	if err != nil {
		return nil, err
	}

	return &Service{
		dirPath: dirPath,
		Name:    path.Base(dirPath),
	}, nil
}

// GetFiles return all files by appname and prefix
func (service *Service) GetFiles(prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	fileInfos, err := ioutil.ReadDir(service.getAppPrefix(prefix))
	if err != nil {
		return nil, err
	}

	for _, fileInfo := range fileInfos {
		dir := fileInfo.IsDir()
		name := fileInfo.Name()
		filePath := strings.TrimRight(path.Join(prefix, name), "/")
		size := fileInfo.Size()
		checksum := ""
		if dir {
			checksum, _ = service.Checksum(filePath)
		}

		lastModified := fileInfo.ModTime()
		file := &get3w.File{
			Dir:          dir,
			Path:         filePath,
			Name:         name,
			Size:         size,
			Checksum:     checksum,
			LastModified: &lastModified,
		}
		files = append(files, file)
	}

	return files, nil
}

// GetAllFiles return all files by appname
func (service *Service) GetAllFiles() ([]*get3w.File, error) {
	files := []*get3w.File{}

	err := filepath.Walk(service.getAppPrefix(""), func(p string, fileInfo os.FileInfo, err error) error {
		dir := fileInfo.IsDir()
		name := fileInfo.Name()
		filePath := strings.TrimRight(name, "/")
		size := fileInfo.Size()
		checksum := ""
		if dir {
			checksum, _ = service.Checksum(filePath)
		}

		lastModified := fileInfo.ModTime()
		file := &get3w.File{
			Dir:          dir,
			Path:         filePath,
			Name:         name,
			Size:         size,
			Checksum:     checksum,
			LastModified: &lastModified,
		}
		files = append(files, file)
		return nil
	})

	if err != nil {
		return nil, err
	}

	return files, nil
}

// Write string content to specified key resource
func (service *Service) Write(key string, content string) error {
	return service.WriteBinary(key, []byte(content))
}

// WriteBinary upload file
func (service *Service) WriteBinary(key string, bs []byte) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	p := service.getAppKey(key)
	mkdirByFile(p)
	fmt.Printf("Page %s created\n", key)
	return ioutil.WriteFile(p, bs, 0644)
}

// WriteReader copies from the given reader and writes it to a file with the
// given filename.
func (service *Service) WriteReader(key string, r io.Reader) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	p := service.getAppKey(key)
	file, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		return fmt.Errorf("unable to create file: %v", err)
	}
	defer file.Close()

	if _, err := io.Copy(file, r); err != nil {
		return fmt.Errorf("unable to write file: %v", err)
	}

	return nil
}

// Copy object to destinatioin
func (service *Service) Copy(sourceKey string, destinationKey string) error {
	if sourceKey == "" {
		return fmt.Errorf("sourceKey must be a nonempty string")
	}
	if destinationKey == "" {
		return fmt.Errorf("destinationKey must be a nonempty string")
	}

	bs, err := ioutil.ReadFile(service.getAppKey(sourceKey))
	if err != nil {
		return err
	}

	return service.WriteBinary(destinationKey, bs)
}

// Checksum compute file's MD5 digist
func (service *Service) Checksum(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	file, err := os.Open(service.getAppKey(key))
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}

	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

// Read return resource content
func (service *Service) Read(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	bs, err := ioutil.ReadFile(service.getAppKey(key))

	if err != nil {
		return "", err
	}

	return string(bs), nil
}

// Upload upload object
func (service *Service) Upload(key string, path string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if path == "" {
		return fmt.Errorf("path must be a nonempty string")
	}

	bs, err := ioutil.ReadFile(path)
	if err != nil {
		return err
	}

	return service.WriteBinary(key, bs)
}

// Download file by appname and key
func (service *Service) Download(key string, downloadURL string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if downloadURL == "" {
		return fmt.Errorf("downloadURL must be a nonempty string")
	}

	p := service.getAppKey(key)
	mkdirByFile(p)

	out, err := os.Create(p)
	defer out.Close()

	resp, err := http.Get(downloadURL)
	defer resp.Body.Close()

	_, err = io.Copy(out, resp.Body)

	return err
}

// IsExist return true if specified key exists
func (service *Service) IsExist(key string) bool {
	if key == "" {
		return false
	}

	_, err := os.Stat(service.getAppKey(key))
	return !os.IsNotExist(err)
}

// Delete specified object
func (service *Service) Delete(key string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	return os.Remove(service.getAppKey(key))
}

// Deletes delete objects
func (service *Service) Deletes(keys []string) error {
	if len(keys) == 0 {
		return fmt.Errorf("keys must be a nonempty string array")
	}

	for _, key := range keys {
		err := os.Remove(service.getAppKey(key))
		if err != nil {
			return err
		}
	}

	return nil
}

// DeleteAll delete objects by prefix
func (service *Service) DeleteAll(prefix string) error {
	return os.RemoveAll(service.getAppPrefix(prefix))
}
