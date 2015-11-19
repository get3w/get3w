package local

import (
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
	directoryPath string
	Name          string
}

// NewService return new service
func NewService(contextDir string) *Service {
	directoryPath, err := getDirectoryPath(contextDir)

	if err != nil {
		return &Service{}
	}
	return &Service{
		directoryPath: directoryPath,
		Name:          path.Base(directoryPath),
	}
}

// getDirectoryPath uses the given context directory and returns the absolute
// path to the context directory, the relative path of the get3w.yml in that
// context directory, and a non-nil error on success.
func getDirectoryPath(contextDir string) (directoryPath string, err error) {
	if contextDir == "" {
		contextDir = "./"
	}

	if directoryPath, err = filepath.Abs(contextDir); err != nil {
		return "", fmt.Errorf("unable to get absolute context directory: %v", err)
	}

	stat, err := os.Lstat(directoryPath)
	if err != nil {
		return "", fmt.Errorf("unable to stat context directory %q: %v", directoryPath, err)
	}

	if !stat.IsDir() {
		return "", fmt.Errorf("context must be a directory: %s", directoryPath)
	}

	return directoryPath, nil
}

// getAppPrefix return app prefix
func (service *Service) getAppPrefix(prefix string) string {
	p := path.Join(service.directoryPath, prefix)
	p = strings.TrimRight(p, "/") + "/"
	p, _ = filepath.Abs(p)
	return p
}

// getAppKey return app key
func (service *Service) getAppKey(key string) string {
	p := path.Join(service.directoryPath, key)
	p = strings.TrimRight(p, "/")
	p, _ = filepath.Abs(p)
	return p
}

// GetFiles return all files by appname and prefix
func (service *Service) GetFiles(prefix string) ([]*get3w.File, error) {
	if service.directoryPath == "" {
		return []*get3w.File{}, fmt.Errorf("service not avaliable")
	}

	files := []*get3w.File{}

	fileInfos, err := ioutil.ReadDir(service.getAppPrefix(prefix))
	if err != nil {
		return nil, err
	}

	for _, fileInfo := range fileInfos {
		filePath := strings.TrimRight(path.Join(prefix, fileInfo.Name()), "/")
		name := fileInfo.Name()

		dir := &get3w.File{
			IsDir: fileInfo.IsDir(),
			Path:  filePath,
			Name:  name,
			Size:  fileInfo.Size(),
		}
		files = append(files, dir)
	}

	return files, nil
}

// GetAllFiles return all files by appname
func (service *Service) GetAllFiles() ([]*get3w.File, error) {
	if service.directoryPath == "" {
		return []*get3w.File{}, fmt.Errorf("service not avaliable")
	}

	files := []*get3w.File{}

	err := filepath.Walk(service.getAppPrefix(""), func(p string, fileInfo os.FileInfo, err error) error {
		filePath := strings.TrimRight(path.Join(fileInfo.Name()), "/")
		name := fileInfo.Name()

		file := &get3w.File{
			IsDir: fileInfo.IsDir(),
			Path:  filePath,
			Name:  name,
			Size:  fileInfo.Size(),
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
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	p := service.getAppKey(key)
	fmt.Printf("Page %s created\n", key)
	os.MkdirAll(filepath.Dir(p), os.ModeDir)
	return ioutil.WriteFile(p, bs, 0644)
}

// WriteReader copies from the given reader and writes it to a file with the
// given filename.
func (service *Service) WriteReader(key string, r io.Reader) error {
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
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
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
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

// Read return resource content
func (service *Service) Read(key string) (string, error) {
	if service.directoryPath == "" {
		return "", fmt.Errorf("service not avaliable")
	}
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
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
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
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}
	if downloadURL == "" {
		return fmt.Errorf("downloadURL must be a nonempty string")
	}
	p := service.getAppKey(key)
	os.MkdirAll(path.Dir(p), os.ModeDir)

	out, err := os.Create(p)
	defer out.Close()

	resp, err := http.Get(downloadURL)
	defer resp.Body.Close()

	_, err = io.Copy(out, resp.Body)

	return err
}

// IsExist return true if specified key exists
func (service *Service) IsExist(key string) bool {
	if service.directoryPath == "" || key == "" {
		return false
	}

	_, err := os.Stat(service.getAppKey(key))
	return !os.IsNotExist(err)
}

// Delete specified object
func (service *Service) Delete(key string) error {
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
	if key == "" {
		return fmt.Errorf("key must be a nonempty string")
	}

	return os.Remove(service.getAppKey(key))
}

// Deletes delete objects
func (service *Service) Deletes(keys []string) error {
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}
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
	if service.directoryPath == "" {
		return fmt.Errorf("service not avaliable")
	}

	return os.RemoveAll(service.getAppPrefix(prefix))
}
