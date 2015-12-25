package types

import (
	"os"
	"time"

	"github.com/get3w/get3w/pkg/nat"
	"github.com/get3w/get3w/pkg/version"
)

// ContainerCreateResponse contains the information returned to a client on the
// creation of a new container.
type ContainerCreateResponse struct {
	// ID is the ID of the created container.
	ID string `json:"Id"`

	// Warnings are any warnings encountered during the creation of the container.
	Warnings []string `json:"Warnings"`
}

// ContainerExecCreateResponse contains response of Remote API:
// POST "/containers/{name:.*}/exec"
type ContainerExecCreateResponse struct {
	// ID is the exec ID.
	ID string `json:"Id"`
}

// AuthResponse contains response of Remote API:
// POST "/auth"
type AuthResponse struct {
	// Status is the authentication status
	Status string `json:"Status"`
}

// ContainerWaitResponse contains response of Remote API:
// POST "/containers/"+containerID+"/wait"
type ContainerWaitResponse struct {
	// StatusCode is the status code of the wait job
	StatusCode int `json:"StatusCode"`
}

// ContainerCommitResponse contains response of Remote API:
// POST "/commit?container="+containerID
type ContainerCommitResponse struct {
	ID string `json:"Id"`
}

// ContainerChange contains response of Remote API:
// GET "/containers/{name:.*}/changes"
type ContainerChange struct {
	Kind int
	Path string
}

// ImageHistory contains response of Remote API:
// GET "/images/{name:.*}/history"
type ImageHistory struct {
	ID        string `json:"Id"`
	Created   int64
	CreatedBy string
	Tags      []string
	Size      int64
	Comment   string
}

// ImageDelete contains response of Remote API:
// DELETE "/images/{name:.*}"
type ImageDelete struct {
	Untagged string `json:",omitempty"`
	Deleted  string `json:",omitempty"`
}

// Image contains response of Remote API:
// GET "/images/json"
type Image struct {
	ID          string `json:"Id"`
	ParentID    string `json:"ParentId"`
	RepoTags    []string
	RepoDigests []string
	Created     int64
	Size        int64
	VirtualSize int64
	Labels      map[string]string
}

// GraphDriverData returns Image's graph driver config info
// when calling inspect command
type GraphDriverData struct {
	Name string
	Data map[string]string
}

// ImageInspect contains response of Remote API:
// GET "/images/{name:.*}/json"
type ImageInspect struct {
	ID            string `json:"Id"`
	RepoTags      []string
	RepoDigests   []string
	Parent        string
	Comment       string
	Created       string
	Container     string
	DockerVersion string
	Author        string
	Architecture  string
	Os            string
	Size          int64
	VirtualSize   int64
	GraphDriver   GraphDriverData
}

// Port stores open ports info of container
// e.g. {"PrivatePort": 8080, "PublicPort": 80, "Type": "tcp"}
type Port struct {
	IP          string `json:",omitempty"`
	PrivatePort int
	PublicPort  int `json:",omitempty"`
	Type        string
}

// Container contains response of Remote API:
// GET  "/containers/json"
type Container struct {
	ID         string `json:"Id"`
	Names      []string
	Image      string
	ImageID    string
	Command    string
	Created    int64
	Ports      []Port
	SizeRw     int64 `json:",omitempty"`
	SizeRootFs int64 `json:",omitempty"`
	Labels     map[string]string
	Status     string
	HostConfig struct {
		NetworkMode string `json:",omitempty"`
	}
}

// CopyConfig contains request body of Remote API:
// POST "/containers/"+containerID+"/copy"
type CopyConfig struct {
	Resource string
}

// ContainerPathStat is used to encode the header from
// GET "/containers/{name:.*}/archive"
// "Name" is the file or directory name.
type ContainerPathStat struct {
	Name       string      `json:"name"`
	Size       int64       `json:"size"`
	Mode       os.FileMode `json:"mode"`
	Mtime      time.Time   `json:"mtime"`
	LinkTarget string      `json:"linkTarget"`
}

// ContainerProcessList contains response of Remote API:
// GET "/containers/{name:.*}/top"
type ContainerProcessList struct {
	Processes [][]string
	Titles    []string
}

// Version contains response of Remote API:
// GET "/version"
type Version struct {
	Version       string
	APIVersion    version.Version `json:"ApiVersion"`
	GitCommit     string
	GoVersion     string
	Os            string
	Arch          string
	KernelVersion string `json:",omitempty"`
	Experimental  bool   `json:",omitempty"`
	BuildTime     string `json:",omitempty"`
}

// ExecStartCheck is a temp struct used by execStart
// Config fields is part of ExecConfig in runconfig package
type ExecStartCheck struct {
	// ExecStart will first check if it's detached
	Detach bool
	// Check if there's a tty
	Tty bool
}

// ContainerState stores container's running state
// it's part of ContainerJSONBase and will return by "inspect" command
type ContainerState struct {
	Status     string
	Running    bool
	Paused     bool
	Restarting bool
	OOMKilled  bool
	Dead       bool
	Pid        int
	ExitCode   int
	Error      string
	StartedAt  string
	FinishedAt string
}

// ContainerJSONBase contains response of Remote API:
// GET "/containers/{name:.*}/json"
type ContainerJSONBase struct {
	ID              string `json:"Id"`
	Created         string
	Path            string
	Args            []string
	State           *ContainerState
	Image           string
	ResolvConfPath  string
	HostnamePath    string
	HostsPath       string
	LogPath         string
	Name            string
	RestartCount    int
	Driver          string
	MountLabel      string
	ProcessLabel    string
	AppArmorProfile string
	ExecIDs         []string
	GraphDriver     GraphDriverData
	SizeRw          *int64 `json:",omitempty"`
	SizeRootFs      *int64 `json:",omitempty"`
}

// ContainerJSON is newly used struct along with MountPoint
type ContainerJSON struct {
	*ContainerJSONBase
	Mounts          []MountPoint
	NetworkSettings *NetworkSettings
}

// NetworkSettings exposes the network settings in the api
type NetworkSettings struct {
	NetworkSettingsBase
	DefaultNetworkSettings
}

// NetworkSettingsBase holds basic information about networks
type NetworkSettingsBase struct {
	Bridge                 string
	SandboxID              string
	HairpinMode            bool
	LinkLocalIPv6Address   string
	LinkLocalIPv6PrefixLen int
	Ports                  nat.PortMap
	SandboxKey             string
}

// DefaultNetworkSettings holds network information
// during the 2 release deprecation period.
// It will be removed in Docker 1.11.
type DefaultNetworkSettings struct {
	EndpointID          string
	Gateway             string
	GlobalIPv6Address   string
	GlobalIPv6PrefixLen int
	IPAddress           string
	IPPrefixLen         int
	IPv6Gateway         string
	MacAddress          string
}

// MountPoint represents a mount point configuration inside the container.
type MountPoint struct {
	Name        string `json:",omitempty"`
	Source      string
	Destination string
	Driver      string `json:",omitempty"`
	Mode        string
	RW          bool
}

// Volume represents the configuration of a volume for the remote API
type Volume struct {
	Name       string // Name is the name of the volume
	Driver     string // Driver is the Driver name used to create the volume
	Mountpoint string // Mountpoint is the location on disk of the volume
}

// VolumesListResponse contains the response for the remote API:
// GET "/volumes"
type VolumesListResponse struct {
	Volumes []*Volume // Volumes is the list of volumes being returned
}

// VolumeCreateRequest contains the response for the remote API:
// POST "/volumes/create"
type VolumeCreateRequest struct {
	Name       string            // Name is the requested name of the volume
	Driver     string            // Driver is the name of the driver that should be used to create the volume
	DriverOpts map[string]string // DriverOpts holds the driver specific options to use for when creating the volume.
}

// NetworkResource is the body of the "get network" http response message
type NetworkResource struct {
	Name       string
	ID         string `json:"Id"`
	Scope      string
	Driver     string
	Containers map[string]EndpointResource
	Options    map[string]string
}

// EndpointResource contains network resources allocated and used for a container in a network
type EndpointResource struct {
	EndpointID  string
	MacAddress  string
	IPv4Address string
	IPv6Address string
}

// NetworkCreate is the expected body of the "create network" http request message
type NetworkCreate struct {
	Name           string
	CheckDuplicate bool
	Driver         string
	Options        map[string]string
}

// NetworkCreateResponse is the response message sent by the server for network create call
type NetworkCreateResponse struct {
	ID      string `json:"Id"`
	Warning string
}

// NetworkConnect represents the data to be used to connect a container to the network
type NetworkConnect struct {
	Container string
}

// NetworkDisconnect represents the data to be used to disconnect a container from the network
type NetworkDisconnect struct {
	Container string
}
