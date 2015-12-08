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
	"github.com/get3w/get3w/pkg/timeutils"
)

// Service local service
type Service struct {
	Path string
	Name string
}

// NewService return new service
func NewService(contextDir string) (*Service, error) {
	dirPath, err := GetDirPath(contextDir)
	if err != nil {
		return nil, err
	}

	return &Service{
		Path: dirPath,
		Name: filepath.Base(dirPath),
	}, nil
}

// GetSourcePrefix return app prefix
func (service *Service) GetSourcePrefix(prefix string) string {
	p := path.Join(service.Path, prefix)
	p = strings.TrimRight(p, "/") + "/"
	p, _ = filepath.Abs(p)
	return p
}

// GetDestinationPrefix return app prefix
func (service *Service) GetDestinationPrefix(prefix string) string {
	p := path.Join(service.Path, "_wwwroot", prefix)
	p = strings.TrimRight(p, "/") + "/"
	p, _ = filepath.Abs(p)
	return p
}

// GetSourceKey return app key
func (service *Service) GetSourceKey(key ...string) string {
	p := path.Join(service.Path, path.Join(key...))
	p = strings.TrimRight(p, "/")
	p, _ = filepath.Abs(p)
	return p
}

// GetDestinationKey return app key
func (service *Service) GetDestinationKey(key ...string) string {
	p := path.Join(service.Path, "_wwwroot", path.Join(key...))
	p = strings.TrimRight(p, "/")
	p, _ = filepath.Abs(p)
	return p
}

// GetFiles return all files by appname and prefix
func (service *Service) GetFiles(prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	fileInfos, err := ioutil.ReadDir(prefix)
	if err != nil {
		return nil, err
	}

	for _, fileInfo := range fileInfos {
		isDir := fileInfo.IsDir()
		name := fileInfo.Name()
		filePath := strings.TrimRight(path.Join(prefix, name), "/")
		size := fileInfo.Size()
		checksum := ""
		if isDir {
			checksum, _ = service.Checksum(filePath)
		}

		lastModified := fileInfo.ModTime()
		file := &get3w.File{
			IsDir:        isDir,
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

// GetAllFiles return all files by appname
func (service *Service) GetAllFiles(prefix string) ([]*get3w.File, error) {
	files := []*get3w.File{}

	err := filepath.Walk(prefix, func(p string, fileInfo os.FileInfo, err error) error {
		isDir := fileInfo.IsDir()
		name := fileInfo.Name()
		filePath := strings.Trim(strings.Replace(strings.TrimPrefix(p, service.Path), "\\", "/", -1), "/")
		size := fileInfo.Size()
		checksum := ""
		if isDir {
			checksum, _ = service.Checksum(filePath)
		}

		lastModified := fileInfo.ModTime()
		file := &get3w.File{
			IsDir:        isDir,
			Path:         filePath,
			Name:         name,
			Size:         size,
			Checksum:     checksum,
			LastModified: timeutils.ToString(lastModified),
		}
		files = append(files, file)
		return nil
	})

	if err != nil {
		return nil, err
	}

	return files, nil
}

// Write data to source directory, specified by key
func (service *Service) Write(key string, bs []byte) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	mkdirByFile(key)
	return ioutil.WriteFile(key, bs, 0644)
}

// WriteDestination write data to destination directory, specified by key
func (service *Service) WriteDestination(key string, bs []byte) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	mkdirByFile(key)
	return ioutil.WriteFile(key, bs, 0644)
}

// CopyToDestination object to destinatioin
func (service *Service) CopyToDestination(sourceKey, destinationKey string) error {
	if sourceKey == "" {
		return fmt.Errorf("sourceKey must be a nonempty string")
	}
	if destinationKey == "" {
		return fmt.Errorf("destinationKey must be a nonempty string")
	}

	bs, err := ioutil.ReadFile(sourceKey)
	if err != nil {
		return err
	}

	return service.WriteDestination(destinationKey, bs)
}

// Checksum compute file's MD5 digist
func (service *Service) Checksum(key string) (string, error) {
	if key == "" {
		return "", fmt.Errorf("key must be a nonempty string")
	}

	file, err := os.Open(key)
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

	bs, err := ioutil.ReadFile(key)

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

	return service.Write(key, bs)
}

// Download file by appname and key
func (service *Service) Download(key string, downloadURL string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if downloadURL == "" {
		return fmt.Errorf("downloadURL must be a nonempty string")
	}

	mkdirByFile(key)

	out, err := os.Create(key)
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

	_, err := os.Stat(key)
	return !os.IsNotExist(err)
}

// Delete specified object
func (service *Service) Delete(key string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	return os.Remove(key)
}

// DeleteDestination specified object
func (service *Service) DeleteDestination(key string) error {
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	return os.Remove(key)
}

// Deletes delete objects
func (service *Service) Deletes(keys []string) error {
	if len(keys) == 0 {
		return fmt.Errorf("keys must be a nonempty string array")
	}

	for _, key := range keys {
		err := os.Remove(key)
		if err != nil {
			return err
		}
	}

	return nil
}

// DeleteAll delete objects by prefix
func (service *Service) DeleteAll(prefix string) error {
	return os.RemoveAll(prefix)
}
